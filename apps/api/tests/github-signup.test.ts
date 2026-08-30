import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { Kernel } from '../src/application/kernel.js'
import { openSqlite } from '../src/infrastructure/sqlite/db.js'
import { SqliteProjectRepository } from '../src/infrastructure/sqlite/project-repository.js'
import { SqliteSettingsRepository } from '../src/infrastructure/sqlite/settings-repository.js'
import { createApp } from '../src/presentation/app.js'

function testKernel() {
  const db = openSqlite(':memory:')
  return new Kernel({
    db,
    projects: new SqliteProjectRepository(db),
    settingsRepo: new SqliteSettingsRepository(db),
    repoRoot: join(process.cwd(), '..', '..'),
  })
}

type Upsert = {
  upsertGithubUser: (me: { id: number; login: string }, token: string) => { id: string; role: string }
}

function upsert(kernel: Kernel, me: { id: number; login: string }) {
  return (kernel as unknown as Upsert).upsertGithubUser(me, 'tok')
}

describe('GitHub signup policy', () => {
  it('defaults to closed', () => {
    const kernel = testKernel()
    expect(kernel.settings().githubSignupMode).toBe('closed')
    expect(kernel.settings().githubSignupAllowlist).toEqual([])
    expect(kernel.authPublicConfig().githubSignupMode).toBe('closed')
  })

  it('bootstrap: first GitHub user allowed when empty; then closed blocks new', () => {
    const kernel = testKernel()
    const first = upsert(kernel, { id: 1, login: 'alice' })
    expect(first.role).toBe('admin')
    expect(() => upsert(kernel, { id: 2, login: 'bob' })).toThrow(/signup closed/i)
  })

  it('existing GitHub user may always log in when closed', () => {
    const kernel = testKernel()
    upsert(kernel, { id: 1, login: 'alice' })
    kernel.putSettings({ githubSignupMode: 'closed' })
    const again = upsert(kernel, { id: 1, login: 'alice' })
    expect(again.id).toBeTruthy()
  })

  it('open allows new operators', () => {
    const kernel = testKernel()
    upsert(kernel, { id: 1, login: 'alice' })
    kernel.putSettings({ githubSignupMode: 'open' })
    const bob = upsert(kernel, { id: 2, login: 'bob' })
    expect(bob.role).toBe('operator')
  })

  it('allowlist admits listed login only', () => {
    const kernel = testKernel()
    upsert(kernel, { id: 1, login: 'alice' })
    kernel.putSettings({
      githubSignupMode: 'allowlist',
      githubSignupAllowlist: ['@Carol', 'dave'],
    })
    expect(kernel.settings().githubSignupAllowlist).toEqual(['Carol', 'dave'])
    expect(() => upsert(kernel, { id: 2, login: 'bob' })).toThrow(/allowlist/i)
    const carol = upsert(kernel, { id: 3, login: 'Carol' })
    expect(carol.role).toBe('operator')
  })

  it('admin deployment API reads/writes signup mode', async () => {
    const kernel = testKernel()
    const app = createApp(kernel)
    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secret123' }),
    })
    const { token } = (await reg.json()) as { token: string }
    const hdr = { 'content-type': 'application/json', 'x-ak-session': token }

    const put = await app.request('/api/admin/deployment', {
      method: 'PUT',
      headers: hdr,
      body: JSON.stringify({
        githubSignupMode: 'allowlist',
        githubSignupAllowlist: ['eve'],
      }),
    })
    expect(put.status).toBe(200)
    const body = (await put.json()) as {
      githubSignupMode: string
      githubSignupAllowlist: string[]
    }
    expect(body.githubSignupMode).toBe('allowlist')
    expect(body.githubSignupAllowlist).toEqual(['eve'])

    const get = await app.request('/api/admin/deployment', { headers: hdr })
    const got = (await get.json()) as { githubSignupMode: string }
    expect(got.githubSignupMode).toBe('allowlist')
  })
})
