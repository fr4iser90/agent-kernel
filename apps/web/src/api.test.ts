import { describe, expect, it, vi, afterEach } from 'vitest'

describe('web api client surface', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('approveRun and rejectRun hit correct paths', async () => {
    const calls: Array<{ url: string; method?: string }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method })
        return new Response(JSON.stringify({ run: { id: 'r1', outcome: 'running' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
    const { api } = await import('./api')
    await api.approveRun('r1')
    await api.rejectRun('r1', 'nope')
    expect(calls[0]?.url).toContain('/api/runs/r1/approve')
    expect(calls[0]?.method).toBe('POST')
    expect(calls[1]?.url).toContain('/api/runs/r1/reject')
  })

  it('createGlobalAssignment posts projectId null', async () => {
    let body = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        body = String(init?.body ?? '')
        return new Response(JSON.stringify({ assignment: { id: 'a1' } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
    const { api } = await import('./api')
    await api.createGlobalAssignment({
      profileId: 'tracking-cycle',
      scheduleMode: 'manual',
      reviewMode: 'human',
      fanOut: { mode: 'all_initialized' },
    })
    const parsed = JSON.parse(body) as { projectId: null; fanOut: { mode: string } }
    expect(parsed.projectId).toBeNull()
    expect(parsed.fanOut.mode).toBe('all_initialized')
  })

  it('createProfile and deleteAssignment hit correct paths', async () => {
    const calls: Array<{ url: string; method?: string }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method })
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
    const { api } = await import('./api')
    await api.createProfile({
      id: 'p1',
      label: 'P1',
      rolePath: 'roles/x.md',
      defaultScheduleMode: 'manual',
      defaultReviewMode: 'human',
    })
    await api.deleteAssignment('a1')
    expect(calls[0]?.url).toContain('/api/profiles')
    expect(calls[0]?.method).toBe('POST')
    expect(calls[1]?.url).toContain('/api/assignments/a1')
    expect(calls[1]?.method).toBe('DELETE')
  })
})
