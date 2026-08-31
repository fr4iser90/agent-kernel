import { describe, expect, it, vi, afterEach } from 'vitest'
import http from 'node:http'
import { DshHostClient } from '../src/infrastructure/dsh/dsh-host-client.js'
import { DshExecutor } from '../src/infrastructure/dsh/dsh-executor.js'
import type { SessionBrief } from '@agent-kernel/session-brief'

describe('DshHostClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ping + createSession + prompt via local server', async () => {
    const server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (c) => {
        body += String(c)
      })
      req.on('end', () => {
        const path = req.url ?? ''
        if (path.startsWith('/api/session.list')) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(
            JSON.stringify({
              type: 'server-response',
              rpcId: '1',
              result: { ok: true, value: { items: [] } }
            }),
          )
          return
        }
        if (path.startsWith('/api/session.create')) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(
            JSON.stringify({
              type: 'server-response',
              rpcId: '1',
              result: { ok: true, value: { sessionId: 'sess-1' } }
            }),
          )
          return
        }
        if (path.startsWith('/api/session.prompt')) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(
            JSON.stringify({
              type: 'server-response',
              rpcId: '1',
              result: { ok: true, value: {} }
            }),
          )
          return
        }
        if (path.startsWith('/api/session.history')) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(
            JSON.stringify({
              type: 'server-response',
              rpcId: '1',
              result: {
                ok: true,
                value: {
                  hasMore: false,
                  events: [
                    {
                      event: {
                        type: 'user/message',
                        seq: 1,
                        time: 1,
                        data: { content: [{ type: 'text', text: 'hi' }] }
                      }
                    },
                  ]
                }
              }
            }),
          )
          return
        }
        res.writeHead(404)
        res.end(body)
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw new Error('no port')
    const port = addr.port
    const host = `127.0.0.1:${port}`
    const client = new DshHostClient({
      endpoint: `http://${host}`,
      trustedHost: host
    })
    await client.ping()
    const { sessionId } = await client.createSession('/tmp')
    expect(sessionId).toBe('sess-1')
    await client.prompt(sessionId, 'hi')

    const ex = new DshExecutor(client)
    const brief = {
      projectId: 'p',
      assignmentId: 'a',
      executorId: 'dsh',
      workdir: '/tmp',
      runId: 'agent/x',
      lawpackPin: null,
      injectionMode: 'harness_inject',
      rolesPath: null,
      agentsMdPath: 'AGENTS.md',
      gateCommand: null,
      ownedPathsRef: null,
      profileId: 'tracking-cycle',
      reviewMode: 'human',
      initialObjective: 'do it',
      injectMaterialization: 'prompt_inline',
      rolePromptText: 'ROLE'
    } satisfies SessionBrief
    const started = await ex.start(brief)
    expect(started.executorSessionId).toBe('sess-1')
    await ex.nudge(brief, started.executorSessionId, 'nudge')
    await expect(ex.getTranscript('sess-1')).rejects.toThrow(/not in session.list/)
    await new Promise<void>((r) => server.close(() => r()))
  })

  it('getTranscript maps history through ExecutorPort', async () => {
    const server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (c) => {
        body += String(c)
      })
      req.on('end', () => {
        const path = req.url ?? ''
        if (path.startsWith('/api/session.list')) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(
            JSON.stringify({
              type: 'server-response',
              rpcId: '1',
              result: {
                ok: true,
                value: {
                  items: [
                    {
                      sessionId: 'sess-1',
                      updatedAt: 1,
                      running: false,
                      blank: false,
                      cwd: '/tmp',
                      projections: { asOfSeq: 1, values: { title: 't' } }
                    },
                  ]
                }
              }
            }),
          )
          return
        }
        if (path.startsWith('/api/session.history')) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(
            JSON.stringify({
              type: 'server-response',
              rpcId: '1',
              result: {
                ok: true,
                value: {
                  hasMore: false,
                  events: [
                    {
                      event: {
                        type: 'user/message',
                        seq: 1,
                        time: 1,
                        data: { content: [{ type: 'text', text: 'hello' }] }
                      }
                    },
                  ]
                }
              }
            }),
          )
          return
        }
        res.writeHead(404)
        res.end(body)
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw new Error('no port')
    const host = `127.0.0.1:${addr.port}`
    const ex = new DshExecutor(
      new DshHostClient({ endpoint: `http://${host}`, trustedHost: host }),
    )
    const tx = await ex.getTranscript('sess-1')
    expect(tx.session.title).toBe('t')
    expect(tx.messages[0]?.text).toBe('hello')
    expect(tx.meta.eventCount).toBe(1)
    await new Promise<void>((r) => server.close(() => r()))
  })

  it('allows endpoint host ≠ trustedHost (tunnel / VPN)', async () => {
    let seenHost: string | undefined
    const server = http.createServer((req, res) => {
      seenHost = req.headers.host
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          type: 'server-response',
          rpcId: '1',
          result: { ok: true, value: { items: [] } }
        }),
      )
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw new Error('no port')
    const client = new DshHostClient({
      endpoint: `http://127.0.0.1:${addr.port}`,
      trustedHost: 'localhost:13080'
    })
    await client.ping()
    expect(seenHost).toBe('localhost:13080')
    await new Promise<void>((r) => server.close(() => r()))
  })
})
