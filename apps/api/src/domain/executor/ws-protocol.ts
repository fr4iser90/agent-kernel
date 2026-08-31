/**
 * Wire protocol for DSH ↔ kernel control channel (WSS).
 * MCP tools stay on HTTPS REST — not on this socket.
 */

export type ServerToDeviceMessage =
  | {
      type: 'hello'
      ownerId: string
      serverTime: string
    }
  | {
      type: 'job.created'
      jobId: string
      runId: string
      kind: 'start' | 'nudge' | 'fetch_transcript' | 'operator_turn'
      payload: Record<string, unknown>
      createdAt: string
    }
  | {
      type: 'error'
      message: string
    }

export type DeviceToServerMessage =
  | {
      type: 'hello'
      deviceLabel?: string
    }
  | {
      type: 'heartbeat'
      deviceLabel?: string
    }
  | {
      type: 'job.started'
      jobId: string
    }
  | {
      type: 'job.completed'
      jobId: string
      ok: boolean
      result?: Record<string, unknown>
      error?: string
    }
