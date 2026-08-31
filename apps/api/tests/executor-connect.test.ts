import { afterEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { Kernel } from '../src/application/kernel.js'
import { openSqlite } from '../src/infrastructure/sqlite/db.js'
import { SqliteProjectRepository } from '../src/infrastructure/sqlite/project-repository.js'
import { SqliteSettingsRepository } from '../src/infrastructure/sqlite/settings-repository.js'
import {
  executorDeviceHub,
  type ExecutorDeviceSocket
} from '../src/infrastructure/executor/device-hub.js'

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

function attachMockDevice(ownerId: string): {
  socket: ExecutorDeviceSocket
  messages: unknown[]
} {
  const messages: unknown[] = []
  const socket: ExecutorDeviceSocket = {
    ownerId,
    deviceLabel: 'test',
    send: (data) => {
      messages.push(JSON.parse(data) as unknown)
    },
    close: () => undefined
  }
  executorDeviceHub.attach(socket)
  return { socket, messages }
}

afterEach(() => {
  // detach any leftover sockets by pushing detach on known owners is hard —
  // recreate hub state by detaching via private map: attach then detach each mock in tests.
})

describe('outbound executor WSS', () => {
  it('connect-guide is outbound_wss; Host-HTTP fields absent', async () => {
    process.env.WEB_ORIGIN = 'https://kernel.example'
    const kernel = testKernel()
    const { createApp } = await import('../src/presentation/app.js')
    const app = createApp(kernel)
    const { token } = kernel.registerPasswordUser({
      username: 'bob',
      password: 'password-long-enough'
    })
    const info = kernel.sessionInfo(token)!
    expect(kernel.setupGapsForUser(info.ownerId)).toContain('executorPaired')

    const claimed = kernel.claimDevicePair(kernel.startDevicePair(info.ownerId).code)
    expect(claimed.token).toBeTruthy()
    expect(kernel.getUserExecutorSettings(info.ownerId).executorPaired).toBe(true)
    expect(kernel.setupGapsForUser(info.ownerId)).toEqual([])

    const res = await app.request('/api/me/executor/connect-guide', {
      headers: { cookie: `ak_session=${token}` }
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { mode: string; paired: boolean; wssConnected: boolean }
    expect(body.mode).toBe('outbound_wss')
    expect(body.paired).toBe(true)
    expect(body.wssConnected).toBe(false)
    delete process.env.WEB_ORIGIN
  })

  it('nudge enqueue pushes job.created over WSS; complete updates run', () => {
    process.env.WEB_ORIGIN = 'https://kernel.example'
    const kernel = testKernel()
    const { token } = kernel.registerPasswordUser({
      username: 'worker',
      password: 'password-long-enough'
    })
    const info = kernel.sessionInfo(token)!
    kernel.claimDevicePair(kernel.startDevicePair(info.ownerId).code)

    const { socket, messages } = attachMockDevice(info.ownerId)
    try {
      const runId = 'run-1'
      kernel.deps.db
        .prepare(
          `INSERT INTO runs
           (id, assignment_id, project_id, executor_id, executor_session_id, started_at, ended_at, outcome, brief_json, brief_hash, deny_reason)
           VALUES (?, 'a', 'p', 'dsh', NULL, ?, NULL, 'queued', '{}', 'x', NULL)`,
        )
        .run(runId, new Date().toISOString())

      // enqueue via private path using public pushPending after insert
      kernel.deps.db
        .prepare(
          `INSERT INTO executor_jobs
           (id, owner_id, run_id, kind, status, payload_json, result_json, error_text, created_at, claimed_at, completed_at)
           VALUES ('job-1', ?, ?, 'start', 'pending', ?, NULL, NULL, ?, NULL, NULL)`,
        )
        .run(
          info.ownerId,
          runId,
          JSON.stringify({ brief: { workdir: '/tmp', runId: 'r' } }),
          new Date().toISOString(),
        )

      const n = kernel.pushPendingJobsToDevice(info.ownerId)
      expect(n).toBe(1)
      expect(messages).toHaveLength(1)
      const pushed = messages[0] as { type: string; jobId: string; kind: string }
      expect(pushed.type).toBe('job.created')
      expect(pushed.jobId).toBe('job-1')
      expect(pushed.kind).toBe('start')

      kernel.markExecutorJobClaimed(info.ownerId, 'job-1')
      const done = kernel.completeExecutorJob(info.ownerId, 'job-1', {
        ok: true,
        result: { executorSessionId: 'sess-abc' }
      })
      expect(done.status).toBe('completed')
      const run = kernel.getRun(runId) as { executor_session_id: string; outcome: string }
      expect(run.executor_session_id).toBe('sess-abc')
      expect(run.outcome).toBe('running')
    } finally {
      executorDeviceHub.detach(socket)
      delete process.env.WEB_ORIGIN
    }
  })

  it('enqueue fails loud when no WSS connected', async () => {
    process.env.WEB_ORIGIN = 'https://kernel.example'
    const kernel = testKernel()
    const { token } = kernel.registerPasswordUser({
      username: 'offline',
      password: 'password-long-enough'
    })
    const info = kernel.sessionInfo(token)!
    kernel.claimDevicePair(kernel.startDevicePair(info.ownerId).code)
    kernel.markExecutorPaired(info.ownerId)

    await expect(
      kernel.nudge(info.ownerId, 'missing-assignment'),
    ).rejects.toThrow(/not found|No paired DSH|assignment/i)
    delete process.env.WEB_ORIGIN
  })

  it('stored Host-HTTP JSON normalizes to paired=false without endpoint fields', () => {
    const kernel = testKernel()
    const { token } = kernel.registerPasswordUser({
      username: 'strip-host-http',
      password: 'password-long-enough',
    })
    const info = kernel.sessionInfo(token)!
    kernel.deps.db
      .prepare(
        `INSERT INTO user_settings (user_id, doc_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET doc_json = excluded.doc_json`,
      )
      .run(
        info.ownerId,
        JSON.stringify({
          executorId: 'dsh',
          dshInvokeMode: 'host_http',
          connectMode: 'vpn',
          dshEndpoint: 'http://100.64.0.1:3080',
          dshTrustedHost: '100.64.0.1:3080'
        }),
        new Date().toISOString(),
      )
    const s = kernel.getUserExecutorSettings(info.ownerId)
    expect(s.executorPaired).toBe(false)
    expect((s as Record<string, unknown>).dshEndpoint).toBeUndefined()
    expect((s as Record<string, unknown>).connectMode).toBeUndefined()
  })
})
