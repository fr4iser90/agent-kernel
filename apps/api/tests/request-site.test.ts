import { describe, expect, it } from 'vitest'
import type { Context } from 'hono'
import {
  corsAllowOrigin,
  isLoopbackHost,
  publicOriginFromRequest,
  requestIsHttps
} from '../src/presentation/request-site.js'

function fakeContext(init: {
  host?: string
  forwardedHost?: string
  forwardedProto?: string
  url?: string
}): Context {
  const headers = new Map<string, string>()
  if (init.host) headers.set('host', init.host)
  if (init.forwardedHost) headers.set('x-forwarded-host', init.forwardedHost)
  if (init.forwardedProto) headers.set('x-forwarded-proto', init.forwardedProto)
  return {
    req: {
      url: init.url ?? 'http://127.0.0.1/api/x',
      header: (name: string) => headers.get(name.toLowerCase())
    }
  } as unknown as Context
}

describe('request-site (runtime detect localhost vs public DNS)', () => {
  it('detects https via X-Forwarded-Proto', () => {
    const c = fakeContext({
      host: 'agent-kernel.fr4iser.com',
      forwardedProto: 'https'
    })
    expect(requestIsHttps(c)).toBe(true)
    expect(publicOriginFromRequest(c)).toBe('https://agent-kernel.fr4iser.com')
  })

  it('detects plain http on loopback', () => {
    const c = fakeContext({ host: '127.0.0.1:8080', url: 'http://127.0.0.1:8080/api' })
    expect(requestIsHttps(c)).toBe(false)
    expect(publicOriginFromRequest(c)).toBe('http://127.0.0.1:8080')
    expect(isLoopbackHost('127.0.0.1:8080')).toBe(true)
  })

  it('cors allows same public origin only', () => {
    const c = fakeContext({
      host: 'agent-kernel.fr4iser.com',
      forwardedProto: 'https'
    })
    expect(corsAllowOrigin('https://agent-kernel.fr4iser.com', c)).toBe(
      'https://agent-kernel.fr4iser.com',
    )
    expect(corsAllowOrigin('https://evil.example', c)).toBe('')
  })

  it('cors allows vite loopback when API is loopback', () => {
    const c = fakeContext({ host: '127.0.0.1:8787' })
    expect(corsAllowOrigin('http://localhost:5173', c)).toBe('http://localhost:5173')
  })
})
