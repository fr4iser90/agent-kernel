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

describe('operatorLlm settings', () => {
  it('defaults to executor; gateway mode requires url+key', () => {
    const kernel = testKernel()
    const { token } = kernel.registerPasswordUser({
      username: 'opchat',
      password: 'password-long-enough'
    })
    const ownerId = kernel.sessionInfo(token)!.ownerId
    expect(kernel.getUserExecutorSettings(ownerId).operatorLlm).toBe('executor')

    expect(() =>
      kernel.putUserExecutorSettings(ownerId, { operatorLlm: 'gateway' }),
    ).toThrow(/gatewayUrl/)

    expect(() =>
      kernel.putUserExecutorSettings(ownerId, {
        operatorLlm: 'gateway',
        gatewayUrl: 'https://gw.example/v1'
      }),
    ).toThrow(/gatewayApiKey/)

    const saved = kernel.putUserExecutorSettings(ownerId, {
      operatorLlm: 'gateway',
      gatewayUrl: 'https://gw.example/v1',
      gatewayApiKey: 'sk-test'
    })
    expect(saved.operatorLlm).toBe('gateway')
    expect(saved.gatewayUrl).toBe('https://gw.example/v1')

    const back = kernel.putUserExecutorSettings(ownerId, { operatorLlm: 'executor' })
    expect(back.operatorLlm).toBe('executor')
  })

  it('rejects unknown operatorLlm', () => {
    const kernel = testKernel()
    const { token } = kernel.registerPasswordUser({
      username: 'badmode',
      password: 'password-long-enough'
    })
    const ownerId = kernel.sessionInfo(token)!.ownerId
    expect(() =>
      kernel.putUserExecutorSettings(ownerId, {
        operatorLlm: 'silent-fallback' as 'executor'
      }),
    ).toThrow(/operatorLlm/)
  })

  it('operatorChat fails loud without setup / without live WSS for executor mode', async () => {
    const kernel = testKernel()
    const { token } = kernel.registerPasswordUser({
      username: 'chatfail',
      password: 'password-long-enough'
    })
    const ownerId = kernel.sessionInfo(token)!.ownerId
    await expect(kernel.operatorChat('hi', { ownerId })).rejects.toThrow(/Setup incomplete/)

    kernel.markExecutorPaired(ownerId)
    kernel.putUserExecutorSettings(ownerId, { operatorLlm: 'executor' })
    await expect(kernel.operatorChat('hi', { ownerId })).rejects.toThrow(/WSS|paired DSH/)
  })
})
