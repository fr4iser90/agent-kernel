/**
 * Attach /api/executor/ws to a Node HTTP server (outbound DSH control channel).
 */
import type { IncomingMessage, Server as HttpServer } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import type { Kernel } from '../application/kernel.js'
import type { DeviceToServerMessage } from '../domain/executor/ws-protocol.js'
import {
  executorDeviceHub,
  type ExecutorDeviceSocket,
} from '../infrastructure/executor/device-hub.js'

function tokenFromUpgrade(req: IncomingMessage): string | null {
  try {
    const host = req.headers.host ?? 'localhost'
    const u = new URL(req.url ?? '/', `http://${host}`)
    const q = u.searchParams.get('token')?.trim()
    if (q) return q
  } catch {
    /* ignore */
  }
  const auth = req.headers.authorization
  if (auth?.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim() || null
  }
  return null
}

function pathIsExecutorWs(req: IncomingMessage): boolean {
  try {
    const host = req.headers.host ?? 'localhost'
    const u = new URL(req.url ?? '/', `http://${host}`)
    return u.pathname === '/api/executor/ws'
  } catch {
    return false
  }
}

export function attachExecutorWebSocket(server: HttpServer, kernel: Kernel): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!pathIsExecutorWs(req)) {
      return
    }
    const token = tokenFromUpgrade(req)
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    const ownerId = kernel.ownerFromToken(token)
    if (!ownerId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, ownerId)
    })
  })

  wss.on(
    'connection',
    (ws: WebSocket, _req: IncomingMessage, ownerId: string) => {
      let deviceLabel = 'dsh'
      const device: ExecutorDeviceSocket = {
        ownerId,
        deviceLabel,
        send: (data) => {
          if (ws.readyState === ws.OPEN) ws.send(data)
        },
        close: () => {
          try {
            ws.close()
          } catch {
            /* ignore */
          }
        },
      }

      kernel.markExecutorPaired(ownerId)
      kernel.touchExecutorHeartbeat(ownerId, deviceLabel)
      executorDeviceHub.attach(device)

      device.send(
        JSON.stringify({
          type: 'hello',
          ownerId,
          serverTime: new Date().toISOString(),
        }),
      )

      // Deliver any pending jobs left from a brief disconnect (push once).
      kernel.pushPendingJobsToDevice(ownerId)

      ws.on('message', (raw) => {
        let msg: DeviceToServerMessage
        try {
          msg = JSON.parse(String(raw)) as DeviceToServerMessage
        } catch {
          device.send(JSON.stringify({ type: 'error', message: 'invalid JSON' }))
          return
        }
        try {
          if (msg.type === 'hello' || msg.type === 'heartbeat') {
            if (msg.deviceLabel?.trim()) {
              deviceLabel = msg.deviceLabel.trim()
              device.deviceLabel = deviceLabel
            }
            kernel.touchExecutorHeartbeat(ownerId, deviceLabel)
            return
          }
          if (msg.type === 'job.started') {
            kernel.markExecutorJobClaimed(ownerId, msg.jobId)
            return
          }
          if (msg.type === 'job.completed') {
            kernel.completeExecutorJob(ownerId, msg.jobId, {
              ok: msg.ok,
              result: msg.result,
              error: msg.error,
            })
            return
          }
          device.send(
            JSON.stringify({ type: 'error', message: `unknown message type` }),
          )
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          device.send(JSON.stringify({ type: 'error', message }))
        }
      })

      const onGone = () => {
        executorDeviceHub.detach(device)
      }
      ws.on('close', onGone)
      ws.on('error', onGone)
    },
  )

  return wss
}
