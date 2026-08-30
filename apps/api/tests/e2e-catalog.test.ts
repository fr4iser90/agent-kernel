import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Kernel } from '../src/application/kernel.js'
import { openSqlite } from '../src/infrastructure/sqlite/db.js'
import { SqliteProjectRepository } from '../src/infrastructure/sqlite/project-repository.js'
import { SqliteSettingsRepository } from '../src/infrastructure/sqlite/settings-repository.js'
import { createApp } from '../src/presentation/app.js'
import { scanLocalGitRoots } from '../src/infrastructure/catalog/local-and-github.js'
import { cronMatches } from '../src/infrastructure/cron.js'
import { GitHubClient } from '../src/infrastructure/github/github-client.js'

function testKernel(repoRoot = join(process.cwd(), '..', '..')) {
  const db = openSqlite(':memory:')
  const projects = new SqliteProjectRepository(db)
  const settingsRepo = new SqliteSettingsRepository(db)
  return new Kernel({ db, projects, settingsRepo, repoRoot })
}

function gitInit(dir: string) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'README.md'), '# t\n')
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['commit', '-m', 'i'], { cwd: dir, stdio: 'ignore' })
}

describe('cron', () => {
  it('matches', () => {
    expect(cronMatches('* * * * *', new Date('2026-01-01T00:00:00Z'))).toBe(true)
    expect(cronMatches('0 3 * * *', new Date('2026-01-01T03:00:00Z'))).toBe(true)
    expect(cronMatches('0 3 * * *', new Date('2026-01-01T04:00:00Z'))).toBe(false)
  })
})

describe('scanLocalGitRoots', () => {
  it('finds nested git dirs at top level', () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-scan-'))
    gitInit(join(root, 'alpha'))
    mkdirSync(join(root, 'notgit'))
    writeFileSync(join(root, 'x.zip'), 'z')
    const found = scanLocalGitRoots(root)
    expect(found.map((f) => f.name)).toEqual(['alpha'])
  })
})

describe('GitHubClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('me + list repos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/user')) {
          return new Response(JSON.stringify({ id: 1, login: 'fr4iser90', name: 'P', avatar_url: '' }))
        }
        if (String(url).includes('/user/repos')) {
          return new Response(
            JSON.stringify([
              {
                id: 1,
                name: 'PIDEA',
                full_name: 'fr4iser90/PIDEA',
                private: true,
                html_url: 'https://github.com/fr4iser90/PIDEA',
                clone_url: 'https://github.com/fr4iser90/PIDEA.git',
                ssh_url: 'git@github.com:fr4iser90/PIDEA.git',
                default_branch: 'main',
                description: null,
                pushed_at: null,
                language: 'JS',
              },
            ]),
          )
        }
        if (String(url).includes('/users/fr4iser90/repos')) {
          return new Response(JSON.stringify([]))
        }
        return new Response('no', { status: 404 })
      }),
    )
    const gh = new GitHubClient('tok')
    expect((await gh.me()).login).toBe('fr4iser90')
    expect((await gh.listUserRepos({ visibility: 'all' })).length).toBe(1)
    expect(GitHubClient.oauthAuthorizeUrl('cid', 'http://cb', 'st')).toContain('client_id=cid')
  })

  it('exchangeOAuthCode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ access_token: 'gho_x', token_type: 'bearer', scope: 'repo' }))),
    )
    const t = await GitHubClient.exchangeOAuthCode({
      clientId: 'a',
      clientSecret: 'b',
      code: 'c',
      redirectUri: 'http://x',
    })
    expect(t.access_token).toBe('gho_x')
  })
})

describe('e2e auth + catalog + analyze', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('local login → setup → scan → analyze', async () => {
    const kernel = testKernel()
    const app = createApp(kernel)
    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'e2euser', password: 'secret123' }),
    })
    expect(reg.status).toBe(201)
    const { token } = (await reg.json()) as { token: string }
    await app.request('/api/me/executor', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-ak-session': token },
      body: JSON.stringify({
        dshInvokeMode: 'cli',
        dshCliRoot: mkdtempSync(join(tmpdir(), 'cli-')),
        dshHome: mkdtempSync(join(tmpdir(), 'home-')),
      }),
    })
    const hdr = { 'content-type': 'application/json', 'x-ak-session': token }

    await app.request('/api/settings', {
      method: 'PUT',
      headers: hdr,
      body: JSON.stringify({
        dshInvokeMode: 'cli',
        dshCliRoot: join(process.cwd(), '..', '..'),
        dshHome: mkdtempSync(join(tmpdir(), 'dshhome-')),
        setupCompleted: true,
        githubCloneRoot: mkdtempSync(join(tmpdir(), 'ghclone-')),
        githubDefaultLogin: 'fr4iser90',
      }),
    })

    const root = mkdtempSync(join(tmpdir(), 'ak-gitroot-'))
    gitInit(join(root, 'proj-a'))
    gitInit(join(root, 'proj-b'))

    const scan = await app.request('/api/catalog/scan-local', {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({ path: root, analyze: true }),
    })
    expect(scan.status).toBe(200)
    const scanJson = (await scan.json()) as { registered: unknown[]; analyzed: unknown[] }
    expect(scanJson.registered.length).toBe(2)
    expect(scanJson.analyzed.length).toBe(2)

    const me = await app.request('/api/auth/me', { headers: hdr })
    expect(me.status).toBe(200)
  })

  it('github PAT login → import all → import public', async () => {
    const cloneRoot = mkdtempSync(join(tmpdir(), 'ghclone-'))
    const pubRepo = join(cloneRoot, 'PublicOne')
    const privRepo = join(cloneRoot, 'PrivateOne')
    gitInit(pubRepo)
    gitInit(privRepo)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url)
        if (u.endsWith('/user')) {
          return new Response(
            JSON.stringify({ id: 1, login: 'fr4iser90', name: 'P', avatar_url: '' }),
          )
        }
        if (u.includes('/user/repos')) {
          return new Response(
            JSON.stringify([
              {
                id: 1,
                name: 'PrivateOne',
                full_name: 'fr4iser90/PrivateOne',
                private: true,
                html_url: 'https://github.com/fr4iser90/PrivateOne',
                clone_url: 'https://github.com/fr4iser90/PrivateOne.git',
                ssh_url: 'git@github.com:fr4iser90/PrivateOne.git',
                default_branch: 'main',
                description: null,
                pushed_at: null,
                language: null,
              },
              {
                id: 2,
                name: 'PublicOne',
                full_name: 'fr4iser90/PublicOne',
                private: false,
                html_url: 'https://github.com/fr4iser90/PublicOne',
                clone_url: 'https://github.com/fr4iser90/PublicOne.git',
                ssh_url: 'git@github.com:fr4iser90/PublicOne.git',
                default_branch: 'main',
                description: null,
                pushed_at: null,
                language: null,
              },
            ]),
          )
        }
        if (u.includes('/users/fr4iser90/repos')) {
          return new Response(
            JSON.stringify([
              {
                id: 2,
                name: 'PublicOne',
                full_name: 'fr4iser90/PublicOne',
                private: false,
                html_url: 'https://github.com/fr4iser90/PublicOne',
                clone_url: 'https://github.com/fr4iser90/PublicOne.git',
                ssh_url: 'git@github.com:fr4iser90/PublicOne.git',
                default_branch: 'main',
                description: null,
                pushed_at: null,
                language: null,
              },
            ]),
          )
        }
        if (u.includes('login/oauth/access_token')) {
          return new Response(JSON.stringify({ access_token: 'gho_from_oauth' }))
        }
        return new Response(`unexpected ${u} ${init?.method}`, { status: 500 })
      }),
    )

    const kernel = testKernel()
    kernel.putSettings({
      setupCompleted: true,
      dshInvokeMode: 'cli',
      dshCliRoot: join(process.cwd(), '..', '..'),
      dshHome: mkdtempSync(join(tmpdir(), 'dshhome-')),
      githubCloneRoot: cloneRoot,
      githubDefaultLogin: 'fr4iser90',
      githubOAuthClientId: 'cid',
      githubOAuthClientSecret: 'sec',
      githubOAuthRedirectUri: 'http://127.0.0.1:8787/api/auth/github/callback',
    })
    const app = createApp(kernel)

    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'github', token: 'ghp_test' }),
    })
    expect(login.status).toBe(200)
    const loginJson = (await login.json()) as { token: string; githubLogin: string; provider: string }
    expect(loginJson.githubLogin).toBe('fr4iser90')
    expect(loginJson.provider).toBe('github')
    const hdr = { 'content-type': 'application/json', 'x-ak-session': loginJson.token }
    await app.request('/api/me/executor', {
      method: 'PUT',
      headers: hdr,
      body: JSON.stringify({
        dshInvokeMode: 'cli',
        dshCliRoot: mkdtempSync(join(tmpdir(), 'cli-')),
        dshHome: mkdtempSync(join(tmpdir(), 'home-')),
      }),
    })

    const all = await app.request('/api/catalog/github/import', {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({ visibility: 'all', clone: false, analyze: true }),
    })
    expect(all.status).toBe(200)
    const allJson = (await all.json()) as { repoCount: number; analyzed: string[] }
    expect(allJson.repoCount).toBe(2)
    expect(allJson.analyzed.length).toBeGreaterThanOrEqual(1)

    const pub = await app.request('/api/catalog/github/import', {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({ visibility: 'public', clone: false, analyze: true }),
    })
    expect(pub.status).toBe(200)
    const pubJson = (await pub.json()) as { repoCount: number }
    expect(pubJson.repoCount).toBe(1)

    const start = await app.request('/api/auth/github', { redirect: 'manual' })
    expect([302, 301]).toContain(start.status)

    // oauth callback
    const stateUrl = start.headers.get('location')!
    const state = new URL(stateUrl).searchParams.get('state')!
    const cb = await app.request(
      `/api/auth/github/callback?code=abc&state=${state}`,
      { redirect: 'manual' },
    )
    expect([302, 301]).toContain(cb.status)
  })

  it('assignments fan-out targets + patch + scheduler tick dry', async () => {
    const kernel = testKernel()
    kernel.putSettings({
      setupCompleted: true,
      dshInvokeMode: 'cli',
      dshCliRoot: join(process.cwd(), '..', '..'),
      dshHome: mkdtempSync(join(tmpdir(), 'dshhome-')),
    })
    const app = createApp(kernel)
    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'e2efan', password: 'secret123' }),
    })
    const { token } = (await reg.json()) as { token: string }
    await app.request('/api/me/executor', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-ak-session': token },
      body: JSON.stringify({
        dshInvokeMode: 'cli',
        dshCliRoot: mkdtempSync(join(tmpdir(), 'cli-')),
        dshHome: mkdtempSync(join(tmpdir(), 'home-')),
      }),
    })
    const hdr = { 'content-type': 'application/json', 'x-ak-session': token }

    const dir = mkdtempSync(join(tmpdir(), 'ak-p-'))
    gitInit(dir)
    const projRes = await app.request('/api/projects', {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({ name: 'p', path: dir }),
    })
    const { project } = (await projRes.json()) as { project: { id: string } }
    await app.request(`/api/projects/${project.id}/init`, {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({ presetId: 'tracking' }),
    })

    const gas = await app.request('/api/assignments', {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({
        profileId: 'docs-only',
        scheduleMode: 'manual',
        reviewMode: 'human',
        fanOut: { mode: 'all_initialized' },
      }),
    })
    expect(gas.status).toBe(201)
    const { assignment } = (await gas.json()) as { assignment: { id: string } }
    const targets = await app.request(`/api/assignments/${assignment.id}/targets`, { headers: hdr })
    expect(targets.status).toBe(200)
    const tjson = (await targets.json()) as { projectIds: string[] }
    expect(tjson.projectIds).toContain(project.id)

    const patch = await app.request(`/api/assignments/${assignment.id}`, {
      method: 'PATCH',
      headers: hdr,
      body: JSON.stringify({ paused: true }),
    })
    expect(patch.status).toBe(200)

    const tick = await app.request('/api/scheduler/tick', { method: 'POST', headers: hdr })
    expect(tick.status).toBe(200)
  })
})
