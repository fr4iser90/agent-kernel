import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { Kernel } from '../src/application/kernel.js'
import { openSqlite } from '../src/infrastructure/sqlite/db.js'
import { SqliteProjectRepository } from '../src/infrastructure/sqlite/project-repository.js'
import { SqliteSettingsRepository } from '../src/infrastructure/sqlite/settings-repository.js'

function testKernel() {
  const db = openSqlite(':memory:')
  const k = new Kernel({
    db,
    projects: new SqliteProjectRepository(db),
    settingsRepo: new SqliteSettingsRepository(db),
    repoRoot: join(process.cwd(), '..', '..')
  })
  return k
}

describe('device pairing', () => {
  it('start → claim issues session; second claim fails; status claimed', () => {
    process.env.WEB_ORIGIN = 'https://kernel.example'
    const kernel = testKernel()
    const { token } = kernel.registerPasswordUser({
      username: 'pairer',
      password: 'password-long-enough'
    })
    const info = kernel.sessionInfo(token)!
    const started = kernel.startDevicePair(info.ownerId)
    expect(started.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect(started.kernelUrl).toBe('https://kernel.example')
    expect(kernel.devicePairStatus(info.ownerId, started.code).status).toBe('pending')

    const claimed = kernel.claimDevicePair(started.code)
    expect(claimed.url).toBe('https://kernel.example')
    expect(claimed.token.length).toBeGreaterThan(10)
    expect(kernel.ownerFromToken(claimed.token)).toBe(info.ownerId)
    expect(kernel.devicePairStatus(info.ownerId, started.code).status).toBe('claimed')
    expect(kernel.getUserExecutorSettings(info.ownerId).executorPaired).toBe(true)
    expect(kernel.getUserExecutorSettings(info.ownerId).operatorLlm).toBe('executor')

    expect(() => kernel.claimDevicePair(started.code)).toThrow(/already used/)
    delete process.env.WEB_ORIGIN
  })

  it('claim rejects garbage codes', () => {
    process.env.WEB_ORIGIN = 'https://kernel.example'
    const kernel = testKernel()
    expect(() => kernel.claimDevicePair('nope')).toThrow(/invalid/)
    delete process.env.WEB_ORIGIN
  })
})
