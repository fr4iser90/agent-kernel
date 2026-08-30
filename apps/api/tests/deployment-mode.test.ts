import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { Kernel } from '../src/application/kernel.js'
import { openSqlite } from '../src/infrastructure/sqlite/db.js'
import { SqliteProjectRepository } from '../src/infrastructure/sqlite/project-repository.js'
import { SqliteSettingsRepository } from '../src/infrastructure/sqlite/settings-repository.js'
import { createApp } from '../src/presentation/app.js'
import { deploymentPresets } from '../src/domain/settings/settings.js'

function testKernel() {
  const db = openSqlite(':memory:')
  return new Kernel({
    db,
    projects: new SqliteProjectRepository(db),
    settingsRepo: new SqliteSettingsRepository(db),
    repoRoot: join(process.cwd(), '..', '..'),
  })
}

describe('deployment mode (no kit)', () => {
  it('presets: personal vs hosted/hybrid', () => {
    expect(deploymentPresets('personal')).toEqual({ authRequiredForApi: false })
    expect(deploymentPresets('hosted')).toEqual({ authRequiredForApi: true })
    expect(deploymentPresets('hybrid')).toEqual({ authRequiredForApi: true })
  })

  it('public config; admin toggles mode; no kit routes; operator blocked', async () => {
    const kernel = testKernel()
    const app = createApp(kernel)
    expect(kernel.settings().deploymentMode).toBe('hybrid')

    const pub = await app.request('/api/public/config')
    expect(pub.status).toBe(200)
    const pubJson = (await pub.json()) as { deploymentMode: string; selfHostHint?: string }
    expect(pubJson.deploymentMode).toBe('hybrid')
    expect(pubJson.selfHostHint).toMatch(/compose/i)

    expect((await app.request('/api/kit/download')).status).toBe(404)

    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secret123' }),
    })
    const { token } = (await reg.json()) as { token: string }
    const hdr = { 'content-type': 'application/json', 'x-ak-session': token }

    const personal = await app.request('/api/admin/deployment', {
      method: 'PUT',
      headers: hdr,
      body: JSON.stringify({ deploymentMode: 'personal' }),
    })
    expect(personal.status).toBe(200)
    expect(((await personal.json()) as { authRequiredForApi: boolean }).authRequiredForApi).toBe(
      false,
    )

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
      body: JSON.stringify({ deploymentMode: 'hybrid' }),
    })
    expect(opPut.status).toBe(401)
  })
})
