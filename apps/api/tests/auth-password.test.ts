import { describe, expect, it } from 'vitest'
import { Kernel } from '../src/application/kernel.js'
import { openSqlite } from '../src/infrastructure/sqlite/db.js'
import { SqliteProjectRepository } from '../src/infrastructure/sqlite/project-repository.js'
import { SqliteSettingsRepository } from '../src/infrastructure/sqlite/settings-repository.js'
import { createApp } from '../src/presentation/app.js'
import { join } from 'node:path'
import { hashPassword, verifyPassword } from '../src/infrastructure/auth/password.js'

function testKernel() {
  const db = openSqlite(':memory:')
  const k = new Kernel({
    db,
    projects: new SqliteProjectRepository(db),
    settingsRepo: new SqliteSettingsRepository(db),
    repoRoot: join(process.cwd(), '..', '..'),
  })
  return k
}

describe('password auth (secure only)', () => {
  it('hashes and verifies', () => {
    const h = hashPassword('secret123')
    expect(verifyPassword('secret123', h)).toBe(true)
    expect(verifyPassword('wrong', h)).toBe(false)
  })

  it('bootstrap + login; rejects local-owner; executor setup next', async () => {
    const kernel = testKernel()
    const app = createApp(kernel)

    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secret123' }),
    })
    expect(reg.status).toBe(201)
    const { token, role, nextPath } = (await reg.json()) as {
      token: string
      role: string
      nextPath: string
    }
    expect(role).toBe('admin')
    expect(nextPath).toBe('/setup')

    const local = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'local-owner' }),
    })
    expect(local.status).toBe(400)

    const hdr = { 'content-type': 'application/json', 'x-ak-session': token }
    const me = await app.request('/api/auth/me', { headers: hdr })
    const meJson = (await me.json()) as {
      setupGaps: string[]
      nextSetup: string
      nextPath: string
      ownerId: string
    }
    expect(meJson.nextSetup).toBe('executor')
    expect(meJson.nextPath).toBe('/setup')
    expect(meJson.setupGaps.length).toBeGreaterThan(0)

    kernel.markExecutorPaired(meJson.ownerId)
    const me2 = await app.request('/api/auth/me', { headers: hdr })
    const me2Json = (await me2.json()) as { setupGaps: string[]; nextSetup: string | null }
    expect(me2Json.setupGaps).toEqual([])
    expect(me2Json.nextSetup).toBeNull()
  })
})
