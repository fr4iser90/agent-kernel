import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { URL } from 'node:url'

export type DshHostConfig = {
  /** How the kernel reaches DSH (may be VPN IP — different from Host header). */
  endpoint: string
  /** Host header value; must match DSH TRUSTED_HOST (e.g. localhost:13080). */
  trustedHost: string
  basicAuthUser?: string | null
  basicAuthPassword?: string | null
}

function assertConfig(cfg: DshHostConfig): URL {
  if (!cfg.endpoint?.trim()) throw new Error('DSH requires Settings.dshEndpoint')
  if (!cfg.trustedHost?.trim()) throw new Error('DSH requires Settings.dshTrustedHost')
  return new URL(cfg.endpoint)
}

async function rawRequest(
  cfg: DshHostConfig,
  method: string,
  pathAndQuery: string,
  body?: Buffer | string,
  contentType?: string,
): Promise<{ status: number; body: Buffer }> {
  const base = assertConfig(cfg)
  const u = new URL(pathAndQuery, base)
  const lib = u.protocol === 'https:' ? httpsRequest : httpRequest
  const headers: Record<string, string | number> = {
    Host: cfg.trustedHost,
    Accept: 'application/json',
  }
  if (contentType) headers['Content-Type'] = contentType
  if (body) headers['Content-Length'] = Buffer.byteLength(body)
  if (cfg.basicAuthUser && cfg.basicAuthPassword) {
    headers.Authorization =
      'Basic ' + Buffer.from(`${cfg.basicAuthUser}:${cfg.basicAuthPassword}`).toString('base64')
  }

  return new Promise((resolve, reject) => {
    const req = lib(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }),
        )
      },
    )
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

type RpcResponse = {
  type: 'server-response'
  rpcId: string
  result: { ok: true; value: unknown } | { ok: false; error: unknown }
}

/** DeepSeek Harness Host HTTP client (wire only — no ExecutorPort). */
export class DshHostClient {
  constructor(private readonly cfg: DshHostConfig) {
    assertConfig(cfg)
  }

  async rpc<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    const body = JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method,
      payload,
    })
    const res = await rawRequest(this.cfg, 'POST', `/api/${method}`, body, 'application/json')
    if (res.status === 401 || res.status === 403) {
      throw new Error(`DSH auth failed HTTP ${res.status} — check Traefik basic auth / TRUSTED_HOST`)
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`DSH RPC HTTP ${res.status} ${method}: ${res.body.toString('utf8')}`)
    }
    const json = JSON.parse(res.body.toString('utf8')) as RpcResponse
    if (!json.result || json.result.ok !== true) {
      throw new Error(`DSH RPC failed ${method}: ${JSON.stringify(json.result)}`)
    }
    return json.result.value as T
  }

  async putWorkspaceFile(sessionId: string, relPath: string, content: string): Promise<void> {
    const q = new URLSearchParams({ sessionId, path: relPath })
    const res = await rawRequest(
      this.cfg,
      'POST',
      `/api/workspace.put?${q}`,
      Buffer.from(content, 'utf8'),
      'application/octet-stream',
    )
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`DSH workspace.put HTTP ${res.status}: ${res.body.toString('utf8')}`)
    }
  }

  async createSession(cwd: string): Promise<{ sessionId: string }> {
    const value = await this.rpc<{ sessionId?: string; id?: string }>('session.create', {
      cwd,
      agentPreset: 'standard',
    })
    const sessionId = value.sessionId ?? value.id
    if (!sessionId) throw new Error(`DSH session.create missing sessionId: ${JSON.stringify(value)}`)
    return { sessionId }
  }

  async prompt(sessionId: string, text: string): Promise<void> {
    await this.rpc('session.prompt', {
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text }],
    })
  }

  async ping(): Promise<void> {
    await this.rpc('session.list', {})
  }

  async listSessions(): Promise<{
    items: Array<{
      sessionId: string
      updatedAt: number
      running: boolean
      blank: boolean
      cwd?: string
      agentPreset?: string
      projections?: { asOfSeq: number; values: Record<string, unknown> }
    }>
  }> {
    return this.rpc('session.list', {})
  }

  async history(
    sessionId: string,
    opts?: { beforeSeq?: number; maxMessages?: number },
  ): Promise<{
    events: Array<{
      event: { type: string; seq: number; time: number; data: unknown }
      view?: unknown
    }>
    hasMore: boolean
    projections?: { asOfSeq: number; values: Record<string, unknown> }
  }> {
    if (!sessionId.trim()) throw new Error('DSH session.history requires sessionId')
    return this.rpc('session.history', {
      sessionId,
      ...(opts?.beforeSeq !== undefined ? { beforeSeq: opts.beforeSeq } : {}),
      maxMessages: opts?.maxMessages ?? 100,
    })
  }

  async historyAll(
    sessionId: string,
    maxPages = 20,
  ): Promise<{
    events: Array<{
      event: { type: string; seq: number; time: number; data: unknown }
      view?: unknown
    }>
    pages: number
  }> {
    const collected: Array<{
      event: { type: string; seq: number; time: number; data: unknown }
      view?: unknown
    }> = []
    let beforeSeq: number | undefined
    let pages = 0
    for (let i = 0; i < maxPages; i++) {
      const page = await this.history(sessionId, {
        maxMessages: 100,
        ...(beforeSeq !== undefined ? { beforeSeq } : {}),
      })
      pages += 1
      collected.push(...page.events)
      if (!page.hasMore || page.events.length === 0) break
      const oldest = page.events.reduce(
        (min, e) => Math.min(min, e.event.seq),
        Number.POSITIVE_INFINITY,
      )
      if (!Number.isFinite(oldest)) break
      beforeSeq = oldest
    }
    collected.sort((a, b) => a.event.seq - b.event.seq)
    return { events: collected, pages }
  }
}
