/**
 * Live outbound executor sockets (DSH → kernel WSS).
 * One owner may have multiple devices; jobs are fan-out to all connected.
 */
export type ExecutorWsSend = (data: string) => void

export type ExecutorDeviceSocket = {
  ownerId: string
  deviceLabel: string
  send: ExecutorWsSend
  close: () => void
}

export class ExecutorDeviceHub {
  private readonly byOwner = new Map<string, Set<ExecutorDeviceSocket>>()

  attach(socket: ExecutorDeviceSocket): void {
    let set = this.byOwner.get(socket.ownerId)
    if (!set) {
      set = new Set()
      this.byOwner.set(socket.ownerId, set)
    }
    set.add(socket)
  }

  detach(socket: ExecutorDeviceSocket): void {
    const set = this.byOwner.get(socket.ownerId)
    if (!set) return
    set.delete(socket)
    if (set.size === 0) this.byOwner.delete(socket.ownerId)
  }

  hasLive(ownerId: string): boolean {
    const set = this.byOwner.get(ownerId)
    return Boolean(set && set.size > 0)
  }

  liveCount(ownerId: string): number {
    return this.byOwner.get(ownerId)?.size ?? 0
  }

  /** Push JSON text to all sockets for owner. Returns how many receives. */
  push(ownerId: string, message: unknown): number {
    const set = this.byOwner.get(ownerId)
    if (!set || set.size === 0) return 0
    const data = JSON.stringify(message)
    let n = 0
    for (const s of [...set]) {
      try {
        s.send(data)
        n += 1
      } catch {
        this.detach(s)
        try {
          s.close()
        } catch {
          /* ignore */
        }
      }
    }
    return n
  }
}

/** Process-wide hub — wired from main.ts / tests. */
export const executorDeviceHub = new ExecutorDeviceHub()
