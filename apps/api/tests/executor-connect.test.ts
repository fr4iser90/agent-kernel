import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { Kernel } from '../src/application/kernel.js'
import { assignTunnelRemotePort } from '../src/domain/identity/user.js'
import { openSqlite } from '../src/infrastructure/sqlite/db.js'
import { SqliteProjectRepository } from '../src/infrastructure/sqlite/project-repository.js'
import { SqliteSettingsRepository } from '../src/infrastructure/sqlite/settings-repository.js'

function testKernel() {
  const db = openSqlite(':memory:')
  return new Kernel({
    db,
    projects: new SqliteProjectRepository(db),
    settingsRepo: new SqliteSettingsRepository(db),
    repoRoot: join(process.cwd(), '..', '..'),
  })
}

describe('executor connect modes', () => {
  it('assignTunnelRemotePort is stable per user', () => {
    const a = assignTunnelRemotePort('user-aaa', 13100)
    const b = assignTunnelRemotePort('user-aaa', 13100)
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(13100)
    expect(a).toBeLessThan(14100)
  })

  it('ssh_reverse auto-fills endpoint + trustedHost; guide returns command', () => {
    process.env.EXECUTOR_SSH_TUNNEL_TARGET = 'deploy@kernel.example'
    process.env.EXECUTOR_SSH_TUNNEL_ENDPOINT_HOST = '172.17.0.1'
    const kernel = testKernel()
    const { token } = kernel.registerPasswordUser({
      username: 'alice',
      password: 'password-long-enough',
    })
    const info = kernel.sessionInfo(token)!
    const saved = kernel.putUserExecutorSettings(info.ownerId, {
      connectMode: 'ssh_reverse',
      dshInvokeMode: 'host_http',
      sshTunnelTarget: 'deploy@kernel.example',
    })
    expect(saved.tunnelRemotePort).toBeTypeOf('number')
    expect(saved.dshEndpoint).toBe(`http://172.17.0.1:${saved.tunnelRemotePort}`)
    expect(saved.dshTrustedHost).toBe('localhost:13080')
    const guide = kernel.executorConnectGuide(info.ownerId)
    expect(guide.ssh.command).toContain(`-R ${saved.tunnelRemotePort}:127.0.0.1:13080`)
    expect(guide.ssh.command).toContain('deploy@kernel.example')
    expect(guide.ssh.configured).toBe(true)
    expect(guide.modes.map((m) => m.id)).toEqual([
      'public_url',
      'ssh_reverse',
      'vpn',
      'same_host',
    ])
    delete process.env.EXECUTOR_SSH_TUNNEL_TARGET
    delete process.env.EXECUTOR_SSH_TUNNEL_ENDPOINT_HOST
  })

  it('same_host and vpn fill defaults; connect-guide HTTP works', async () => {
    const kernel = testKernel()
    const { createApp } = await import('../src/presentation/app.js')
    const app = createApp(kernel)
    const { token } = kernel.registerPasswordUser({
      username: 'bob',
      password: 'password-long-enough',
    })
    const info = kernel.sessionInfo(token)!
    const same = kernel.putUserExecutorSettings(info.ownerId, {
      connectMode: 'same_host',
      dshInvokeMode: 'host_http',
      dshEndpoint: null,
      dshTrustedHost: null,
    })
    expect(same.dshEndpoint).toBe('http://127.0.0.1:13080')
    expect(same.dshTrustedHost).toBe('localhost:13080')
    const vpn = kernel.putUserExecutorSettings(info.ownerId, {
      connectMode: 'vpn',
      dshEndpoint: 'http://100.64.0.2:13080',
      dshTrustedHost: null,
    })
    expect(vpn.dshTrustedHost).toBe('100.64.0.2:13080')
    const res = await app.request('/api/me/executor/connect-guide', {
      headers: { cookie: `ak_session=${token}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ssh: { command: string } }
    expect(body.ssh.command).toContain('ssh -N -R')
  })
})
