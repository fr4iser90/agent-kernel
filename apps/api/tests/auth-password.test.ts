import { describe, expect, it } from 'vitest'
import { Kernel } from '../src/application/kernel.js'
import { openSqlite } from '../src/infrastructure/sqlite/db.js'
import { SqliteProjectRepository } from '../src/infrastructure/sqlite/project-repository.js'
import { SqliteSettingsRepository } from '../src/infrastructure/sqlite/settings-repository.js'
import { createApp } from '../src/presentation/app.js'
import { join } from 'node:path'
import { hashPassword, verifyPassword } from '../src/infrastructure/auth/password.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

function testKernel() {
  const db = openSqlite(':memory:')
  return new Kernel({
    db,
    projects: new SqliteProjectRepository(db),
    settingsRepo: new SqliteSettingsRepository(db),
    repoRoot: join(process.cwd(), '..', '..'),
  })
}

describe('password auth (secure only)', () => {
  it('hashes and verifies', () => {
    const h = hashPassword('secret123')
    expect(verifyPassword('secret123', h)).toBe(true)
    expect(verifyPassword('wrong', h)).toBe(false)
  })

  it('bootstrap + login; rejects local-owner; no global executor fallback', async () => {
    const kernel = testKernel()
    const app = createApp(kernel)

    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secret123' }),
    })
    expect(reg.status).toBe(201)
    const { token, role } = (await reg.json()) as { token: string; role: string }
    expect(role).toBe('admin')

    const local = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'local-owner' }),
    })
    expect(local.status).toBe(400)

    const hdr = { 'content-type': 'application/json', 'x-ak-session': token }
    const me = await app.request('/api/auth/me', { headers: hdr })
    const meJson = (await me.json()) as { setupGaps: string[] }
    expect(meJson.setupGaps.length).toBeGreaterThan(0)

    const pingFail = await app.request('/api/settings/test-dsh', { method: 'POST', headers: hdr })
    expect(pingFail.status).toBe(400)

    await app.request('/api/me/executor', {
      method: 'PUT',
      headers: hdr,
      body: JSON.stringify({
        executorPaired: true,
      }),
    })
    // cli path missing bin → ping still errors, but gaps for endpoint fields clear
    const me2 = await app.request('/api/auth/me', { headers: hdr })
    const gaps2 = ((await me2.json()) as { setupGaps: string[] }).setupGaps
    expect(gaps2).toEqual([])
  })
})
