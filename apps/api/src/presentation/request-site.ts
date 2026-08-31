/**
 * Derive public site URL / HTTPS from the incoming request.
 * Traefik hostnames stay in compose.server.yml — this only mirrors what the
 * browser already used to reach us (Host + X-Forwarded-Proto).
 */
import type { Context } from 'hono'

function firstHop(header: string | undefined): string | undefined {
  return header?.split(',')[0]?.trim() || undefined
}

export function requestIsHttps(c: Context): boolean {
  const xf = firstHop(c.req.header('x-forwarded-proto'))?.toLowerCase()
  if (xf === 'https') return true
  if (xf === 'http') return false
  try {
    return new URL(c.req.url).protocol === 'https:'
  } catch {
    return false
  }
}

export function requestHost(c: Context): string {
  const host =
    firstHop(c.req.header('x-forwarded-host')) ||
    c.req.header('host')?.trim() ||
    ''
  if (!host) throw new Error('Host header required')
  return host
}

export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().split(':')[0] ?? ''
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1'
}

/** Public browser origin for this request (no trailing slash). */
export function publicOriginFromRequest(c: Context): string {
  const host = requestHost(c)
  const proto = requestIsHttps(c) ? 'https' : 'http'
  return `${proto}://${host}`
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const u = new URL(origin)
    return isLoopbackHost(u.host)
  } catch {
    return false
  }
}

/**
 * CORS allowlist decision: same public origin as this request, or Vite/local
 * loopback talking to a loopback API.
 */
export function corsAllowOrigin(requestOrigin: string | undefined, c: Context): string {
  if (!requestOrigin) return ''
  let site: string
  try {
    site = publicOriginFromRequest(c)
  } catch {
    return ''
  }
  if (requestOrigin === site) return requestOrigin
  if (isLoopbackHost(requestHost(c)) && isLoopbackOrigin(requestOrigin)) {
    return requestOrigin
  }
  return ''
}
