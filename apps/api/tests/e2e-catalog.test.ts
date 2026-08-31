import { afterEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { Kernel } from '../src/application/kernel.js'
import { openSqlite } from '../src/infrastructure/sqlite/db.js'
import { SqliteProjectRepository } from '../src/infrastructure/sqlite/project-repository.js'
import { SqliteSettingsRepository } from '../src/infrastructure/sqlite/settings-repository.js'
import { createApp } from '../src/presentation/app.js'
import { cronMatches } from '../src/infrastructure/cron.js'
import { GitHubClient } from '../src/infrastructure/github/github-client.js'

function testKernel(repoRoot = join(process.cwd(), '..', '..')) {
  const db = openSqlite(':memory:')
  const projects = new SqliteProjectRepository(db)
  const settingsRepo = new SqliteSettingsRepository(db)
  const k = new Kernel({ db, projects, settingsRepo, repoRoot })
  return k
}

describe('cron', () => {
  it('matches', () => {
    expect(cronMatches('* * * * *', new Date('2026-01-01T00:00:00Z'))).toBe(true)
    expect(cronMatches('0 3 * * *', new Date('2026-01-01T03:00:00Z'))).toBe(true)
    expect(cronMatches('0 3 * * *', new Date('2026-01-01T04:00:00Z'))).toBe(false)
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
                language: 'JS'
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
      redirectUri: 'http://x'
    })
    expect(t.access_token).toBe('gho_x')
  })
})

describe('e2e auth + catalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('local login → setup → register opaque paths → init DB-only', async () => {
    const kernel = testKernel()
    const app = createApp(kernel)
    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'e2euser', password: 'secret123' })
    })
    expect(reg.status).toBe(201)
    const { token } = (await reg.json()) as { token: string }
    const hdr = { 'content-type': 'application/json', 'x-ak-session': token }

    const { ownerId } = (await (
      await app.request('/api/auth/me', { headers: hdr })
    ).json()) as { ownerId: string }
    kernel.markExecutorPaired(ownerId)

    await app.request('/api/settings', {
      method: 'PUT',
      headers: hdr,
      body: JSON.stringify({
        githubDefaultLogin: 'fr4iser90'
      })
    })

    for (const name of ['proj-a', 'proj-b']) {
      const created = await app.request('/api/projects', {
        method: 'POST',
        headers: hdr,
        body: JSON.stringify({ name, path: `/executor/workdir/${name}` })
      })
      expect(created.status).toBe(201)
      const { project } = (await created.json()) as { project: { id: string; localPath: string } }
      expect(project.localPath).toBe(`/executor/workdir/${name}`)

      const init = await app.request(`/api/projects/${project.id}/init`, {
        method: 'POST',
        headers: hdr,
        body: JSON.stringify({ presetId: 'tracking' })
      })
      expect(init.status).toBe(200)
      const initJson = (await init.json()) as { project: { status: string } }
      expect(initJson.project.status).toBe('initialized')
    }

    const list = await app.request('/api/projects', { headers: hdr })
    expect(list.status).toBe(200)
    const listJson = (await list.json()) as { projects: unknown[] }
    expect(listJson.projects.length).toBe(2)

    const me = await app.request('/api/auth/me', { headers: hdr })
    expect(me.status).toBe(200)
  })

  it('github PAT login → oauth start/callback (no catalog import)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url)
        if (u.endsWith('/user')) {
          return new Response(
            JSON.stringify({ id: 1, login: 'fr4iser90', name: 'P', avatar_url: '' }),
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
      githubDefaultLogin: 'fr4iser90',
      githubOAuthClientId: 'cid',
      githubOAuthClientSecret: 'sec',
      githubOAuthRedirectUri: 'http://127.0.0.1:8787/api/auth/github/callback'
    })
    const app = createApp(kernel)

    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'github', token: 'ghp_test' })
    })
    expect(login.status).toBe(200)
    const loginJson = (await login.json()) as {
      token: string
      githubLogin: string
      provider: string
      ownerId: string
    }
    expect(loginJson.githubLogin).toBe('fr4iser90')
    expect(loginJson.provider).toBe('github')
    kernel.markExecutorPaired(loginJson.ownerId)

    const hdr = { 'content-type': 'application/json', 'x-ak-session': loginJson.token }
    const proj = await app.request('/api/projects', {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({
        name: 'from-gh',
        path: '/executor/workdir/from-gh',
        gitRemote: 'https://github.com/fr4iser90/PublicOne.git'
      })
    })
    expect(proj.status).toBe(201)

    const gone = await app.request('/api/catalog/github/import', {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({ visibility: 'all' })
    })
    expect(gone.status).toBe(404)

    const start = await app.request('/api/auth/github', {
      redirect: 'manual',
      headers: { host: '127.0.0.1:8787' }
    })
    expect([302, 301]).toContain(start.status)

    const stateUrl = start.headers.get('location')!
    const state = new URL(stateUrl).searchParams.get('state')!
    const cb = await app.request(`/api/auth/github/callback?code=abc&state=${state}`, {
      redirect: 'manual',
      headers: { host: '127.0.0.1:8787' }
    })
    expect([302, 301]).toContain(cb.status)
    expect(cb.headers.get('location')).toMatch(/^http:\/\/127\.0\.0\.1:8787/)
  })

  it('assignments fan-out targets + patch + scheduler tick dry', async () => {
    const kernel = testKernel()
    const app = createApp(kernel)
    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'e2efan', password: 'secret123' })
    })
    const { token, ownerId } = (await reg.json()) as { token: string; ownerId: string }
    kernel.markExecutorPaired(ownerId)
    const hdr = { 'content-type': 'application/json', 'x-ak-session': token }

    const projRes = await app.request('/api/projects', {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({ name: 'p', path: '/executor/workdir/fanout-p' })
    })
    const { project } = (await projRes.json()) as { project: { id: string } }
    await app.request(`/api/projects/${project.id}/init`, {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({ presetId: 'tracking' })
    })

    const gas = await app.request('/api/assignments', {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({
        profileId: 'docs-only',
        scheduleMode: 'manual',
        reviewMode: 'human',
        fanOut: { mode: 'all_initialized' }
      })
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
      body: JSON.stringify({ paused: true })
    })
    expect(patch.status).toBe(200)

    const tick = await app.request('/api/scheduler/tick', { method: 'POST', headers: hdr })
    expect(tick.status).toBe(200)
  })
})
