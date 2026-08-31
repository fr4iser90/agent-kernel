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

describe('host policy', () => {
  it('authRequiredForApi defaults true', () => {
    const kernel = testKernel()
    expect(kernel.settings().authRequiredForApi).toBe(true)
  })

  it('public config; admin may toggle authRequiredForApi; operator blocked', async () => {
    const kernel = testKernel()
    const app = createApp(kernel)

    const pub = await app.request('/api/public/config')
    expect(pub.status).toBe(200)
    const pubJson = (await pub.json()) as {
      authRequiredForApi: boolean
      allowBootstrapRegister: boolean
      selfHostHint?: string
    }
    expect(pubJson.authRequiredForApi).toBe(true)
    expect(pubJson.allowBootstrapRegister).toBe(true)
    expect(pubJson.selfHostHint).toMatch(/compose/i)

    expect((await app.request('/api/kit/download')).status).toBe(404)

    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secret123' }),
    })
    const { token } = (await reg.json()) as { token: string }
    const hdr = { 'content-type': 'application/json', 'x-ak-session': token }

    const off = await app.request('/api/admin/deployment', {
      method: 'PUT',
      headers: hdr,
      body: JSON.stringify({ authRequiredForApi: false }),
    })
    expect(off.status).toBe(200)
    expect(((await off.json()) as { authRequiredForApi: boolean }).authRequiredForApi).toBe(false)

    const now = new Date().toISOString()
    const opId = 'op-user-1'
    ;(
      kernel as unknown as {
        deps: { db: { prepare: (s: string) => { run: (...a: unknown[]) => void } } }
      }
    ).deps.db
      .prepare(
        `INSERT INTO users (id, username, password_hash, github_id, github_login, github_access_token, role, created_at, updated_at)
         VALUES (?, ?, ?, NULL, NULL, NULL, 'operator', ?, ?)`,
      )
      .run(opId, 'op1', 'x', now, now)
    const opTok = kernel.createSession(opId, { provider: 'password' })
    const opPut = await app.request('/api/admin/deployment', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-ak-session': opTok },
      body: JSON.stringify({ authRequiredForApi: true }),
    })
    expect(opPut.status).toBe(401)
  })
})
