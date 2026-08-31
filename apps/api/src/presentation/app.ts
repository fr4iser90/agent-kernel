import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import type { Kernel } from '../application/kernel.js'
import {
  corsAllowOrigin,
  publicOriginFromRequest,
  requestIsHttps,
} from './request-site.js'

const SESSION_COOKIE = 'ak_session'

function sessionCookieOpts(c: Context, maxAge?: number) {
  const opts: {
    httpOnly: true
    path: string
    sameSite: 'Lax'
    secure: boolean
    maxAge?: number
  } = {
    httpOnly: true,
    path: '/',
    sameSite: 'Lax',
    // Secure when the browser reached us via HTTPS (Traefik terminates TLS).
    secure: requestIsHttps(c),
  }
  if (maxAge !== undefined) opts.maxAge = maxAge
  return opts
}

function sessionToken(c: Context): string | undefined {
  return (
    getCookie(c, SESSION_COOKIE) ??
    c.req.header('x-ak-session') ??
    c.req.header('authorization')?.replace(/^Bearer\s+/i, '')
  )
}

function authed(kernel: Kernel, c: Context): string {
  const owner = kernel.ownerFromToken(sessionToken(c))
  if (!owner) throw new Error('unauthorized')
  return owner
}

function requireAdmin(kernel: Kernel, c: Context): string {
  const info = kernel.sessionInfo(sessionToken(c))
  if (!info || info.role !== 'admin' || info.provider === 'device_pair') {
    throw new Error('unauthorized')
  }
  return info.ownerId
}

/** Server catalog / executor APIs — session required when authRequiredForApi (or always for per-user data). */
function requireApiAuth(kernel: Kernel, c: Context): string {
  return authed(kernel, c)
}


/** Simple in-memory login throttle (per username / IP key). */
const loginFailures = new Map<string, { count: number; until: number }>()

function loginThrottleKey(c: Context, username?: string): string {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  return `${ip}:${(username ?? '').toLowerCase()}`
}

function assertLoginAllowed(key: string): void {
  const row = loginFailures.get(key)
  if (row && row.until > Date.now() && row.count >= 8) {
    throw new Error('too many login attempts — try again later')
  }
}

function recordLoginFailure(key: string): void {
  const now = Date.now()
  const row = loginFailures.get(key)
  const fresh = !row || now - row.until > 60_000
  const count = fresh ? 1 : row.count + 1
  loginFailures.set(key, {
    count,
    until: count >= 8 ? now + 15 * 60_000 : now,
  })
}

function clearLoginFailures(key: string): void {
  loginFailures.delete(key)
}

export function createApp(kernel: Kernel): Hono {
  const app = new Hono()
  app.use(
    '*',
    cors({
      origin: (origin, c) => corsAllowOrigin(origin, c),
      credentials: true,
    }),
  )

  app.onError((err, c) => {
    const msg = err instanceof Error ? err.message : 'error'
    const status =
      msg === 'unauthorized'
        ? 401
        : msg.startsWith('Setup incomplete')
          ? 428
          : msg.includes('not found')
            ? 404
            : 400
    return c.json({ error: msg }, status)
  })

  app.get('/health', (c) => c.json({ ok: true, service: 'agent-kernel-api' }))

  app.get('/api/auth/config', (c) => c.json(kernel.authPublicConfig()))
  app.get('/api/public/config', (c) => c.json(kernel.publicDeploymentConfig()))

  app.post('/api/auth/register', async (c) => {
    const body = (await c.req.json()) as { username?: string; password?: string }
    if (!body.username || !body.password) {
      return c.json({ error: 'username and password required' }, 400)
    }
    const result = kernel.registerPasswordUser({
      username: body.username,
      password: body.password,
      bootstrap: true,
    })
    setCookie(c, SESSION_COOKIE, result.token, sessionCookieOpts(c))
    return c.json(result, 201)
  })

  app.post('/api/auth/login', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      mode?: string
      username?: string
      password?: string
      token?: string
      pat?: string
    }
    const mode = body.mode ?? 'password'
    let result: {
      token: string
      ownerId: string
      username?: string | null
      role?: string | null
      githubLogin?: string | null
      provider: string
      setupRequired: boolean
      setupGaps: string[]
      executorSetupRequired: boolean
      nextSetup: 'executor' | null
      nextPath: string
    }
    if (mode === 'password') {
      if (!body.username || !body.password) {
        return c.json({ error: 'username and password required' }, 400)
      }
      const key = loginThrottleKey(c, body.username)
      assertLoginAllowed(key)
      try {
        result = kernel.loginPassword(body.username, body.password)
        clearLoginFailures(key)
      } catch (e) {
        recordLoginFailure(key)
        throw e
      }
    } else if (mode === 'github' || mode === 'github-pat') {
      const pat = body.token ?? body.pat
      if (!pat?.trim()) return c.json({ error: 'GitHub token/pat required' }, 400)
      const key = loginThrottleKey(c, 'github')
      assertLoginAllowed(key)
      try {
        result = await kernel.loginGithubPat(pat.trim())
        clearLoginFailures(key)
      } catch (e) {
        recordLoginFailure(key)
        throw e
      }
    } else {
      return c.json({ error: `unknown login mode: ${mode} (use password or github)` }, 400)
    }
    setCookie(c, SESSION_COOKIE, result.token, sessionCookieOpts(c))
    return c.json(result)
  })

  app.post('/api/auth/logout', (c) => {
    const token = sessionToken(c)
    if (token) kernel.revokeSession(token)
    setCookie(c, SESSION_COOKIE, '', sessionCookieOpts(c, 0))
    return c.json({ ok: true })
  })

  app.get('/api/auth/github', (c) => {
    const site = publicOriginFromRequest(c)
    const redirect =
      process.env.GITHUB_REDIRECT_URI?.trim() || `${site}/api/auth/github/callback`
    const { url } = kernel.githubOAuthStartUrl(redirect)
    return c.redirect(url, 302)
  })

  app.get('/api/auth/github/callback', async (c) => {
    const code = c.req.query('code')
    const state = c.req.query('state')
    if (!code || !state) return c.json({ error: 'missing code/state' }, 400)
    const result = await kernel.loginGithubOAuthCode(code, state)
    setCookie(c, SESSION_COOKIE, result.token, sessionCookieOpts(c))
    // Same host the browser used (via Traefik/nginx) — not a separate env origin.
    const site = publicOriginFromRequest(c)
    return c.redirect(`${site}${result.nextPath}`, 302)
  })

  app.get('/api/auth/me', (c) => {
    const info = kernel.sessionInfo(sessionToken(c))
    if (!info) throw new Error('unauthorized')
    const nextSetup = kernel.nextSetupStep(info.ownerId)
    return c.json({
      ownerId: info.ownerId,
      username: info.username,
      role: info.role,
      provider: info.provider,
      githubLogin: info.githubLogin,
      setupGaps: kernel.setupGapsForUser(info.ownerId),
      executorSetupRequired: nextSetup === 'executor',
      nextSetup,
      nextPath: kernel.nextSetupPath(info.ownerId),
      auth: kernel.authPublicConfig(),
    })
  })

  app.get('/api/me/executor', (c) => {
    const owner = requireApiAuth(kernel, c)
    const s = kernel.getUserExecutorSettings(owner)
    const { gatewayApiKey, ...safe } = s
    return c.json({
      ...safe,
      gatewayApiKey: gatewayApiKey ? '***' : null,
      setupGaps: kernel.setupGapsForUser(owner),
      heartbeat: kernel.executorHeartbeat(owner),
      wssConnected: kernel.executorConnectGuide(owner).wssConnected,
    })
  })

  app.get('/api/me/executor/connect-guide', (c) => {
    const owner = authed(kernel, c)
    return c.json(kernel.executorConnectGuide(owner))
  })

  app.post('/api/me/pair/start', (c) => {
    const owner = authed(kernel, c)
    return c.json(kernel.startDevicePair(owner), 201)
  })

  app.get('/api/me/pair/status', (c) => {
    const owner = authed(kernel, c)
    const code = c.req.query('code') ?? undefined
    return c.json(kernel.devicePairStatus(owner, code))
  })

  /** Unauthenticated claim — DSH host proxies this; code is the secret. */
  app.post('/api/pair/claim', async (c) => {
    const body = (await c.req.json()) as { code?: string }
    if (!body.code || typeof body.code !== 'string') {
      return c.json({ error: 'code required' }, 400)
    }
    return c.json(kernel.claimDevicePair(body.code))
  })

  /** Optional REST complete — device_pair session only (same trust as WSS). */
  app.post('/api/executor/jobs/:id/complete', async (c) => {
    const info = kernel.sessionInfo(sessionToken(c))
    if (!info || info.provider !== 'device_pair') throw new Error('unauthorized')
    const owner = info.ownerId
    const body = (await c.req.json()) as {
      ok?: boolean
      result?: Record<string, unknown>
      error?: string
    }
    if (typeof body.ok !== 'boolean') {
      return c.json({ error: 'ok boolean required' }, 400)
    }
    return c.json(
      kernel.completeExecutorJob(owner, c.req.param('id'), {
        ok: body.ok,
        result: body.result,
        error: body.error,
      }),
    )
  })

  app.put('/api/me/executor', async (c) => {
    const owner = authed(kernel, c)
    const body = (await c.req.json()) as Record<string, unknown>
    const cur = kernel.getUserExecutorSettings(owner)
    if (body.gatewayApiKey === '***') body.gatewayApiKey = cur.gatewayApiKey
    const saved = kernel.putUserExecutorSettings(owner, body as never)
    const { gatewayApiKey, ...safe } = saved
    return c.json({
      ...safe,
      gatewayApiKey: gatewayApiKey ? '***' : null,
    })
  })

  app.get('/api/settings', (c) => {
    requireAdmin(kernel, c)
    const s = kernel.settings()
    const { dshBasicAuthPassword, gatewayApiKey, githubOAuthClientSecret, ...safe } = s
    return c.json({
      ...safe,
      dshBasicAuthPassword: dshBasicAuthPassword ? '***' : null,
      gatewayApiKey: gatewayApiKey ? '***' : null,
      githubOAuthClientSecret: githubOAuthClientSecret ? '***' : null,
      setupGaps: kernel.setupGaps(),
    })
  })

  app.put('/api/settings', async (c) => {
    requireAdmin(kernel, c)
    const body = (await c.req.json()) as Record<string, unknown>
    const cur = kernel.settings()
    if (body.dshBasicAuthPassword === '***') body.dshBasicAuthPassword = cur.dshBasicAuthPassword
    if (body.gatewayApiKey === '***') body.gatewayApiKey = cur.gatewayApiKey
    if (body.githubOAuthClientSecret === '***') {
      body.githubOAuthClientSecret = cur.githubOAuthClientSecret
    }
    const saved = kernel.putSettings(body as never)
    const { dshBasicAuthPassword, gatewayApiKey, githubOAuthClientSecret, ...safe } = saved
    return c.json({
      ...safe,
      dshBasicAuthPassword: dshBasicAuthPassword ? '***' : null,
      gatewayApiKey: gatewayApiKey ? '***' : null,
      githubOAuthClientSecret: githubOAuthClientSecret ? '***' : null,
      setupGaps: kernel.setupGaps(),
    })
  })

  app.get('/api/admin/deployment', (c) => {
    requireAdmin(kernel, c)
    const s = kernel.settings()
    return c.json({
      authRequiredForApi: s.authRequiredForApi,
      githubSignupMode: s.githubSignupMode,
      githubSignupAllowlist: s.githubSignupAllowlist,
    })
  })

  app.put('/api/admin/deployment', async (c) => {
    requireAdmin(kernel, c)
    const body = (await c.req.json()) as {
      authRequiredForApi?: boolean
      githubSignupMode?: 'closed' | 'open' | 'allowlist'
      githubSignupAllowlist?: string[]
    }
    const saved = kernel.putSettings({
      ...(body.authRequiredForApi !== undefined
        ? { authRequiredForApi: body.authRequiredForApi }
        : {}),
      ...(body.githubSignupMode !== undefined
        ? { githubSignupMode: body.githubSignupMode }
        : {}),
      ...(body.githubSignupAllowlist !== undefined
        ? { githubSignupAllowlist: body.githubSignupAllowlist }
        : {}),
    })
    return c.json({
      authRequiredForApi: saved.authRequiredForApi,
      githubSignupMode: saved.githubSignupMode,
      githubSignupAllowlist: saved.githubSignupAllowlist,
    })
  })

  app.post('/api/settings/test-dsh', async (c) => {
    const owner = requireApiAuth(kernel, c)
    const result = await kernel.pingDsh(owner)
    return c.json({ ok: true, ...result })
  })

  app.get('/api/projects', (c) => {
    const owner = authed(kernel, c)
    return c.json({ projects: kernel.listProjects(owner) })
  })

  app.post('/api/projects', async (c) => {
    const owner = authed(kernel, c)
    const body = await c.req.json()
    const project = kernel.registerProject(owner, body)
    return c.json({ project }, 201)
  })

  /** Ask paired device for workdir candidates (WSS job — no kernel FS scan). */
  app.post('/api/projects/detect', async (c) => {
    const owner = authed(kernel, c)
    return c.json(await kernel.detectWorkdirCandidates(owner))
  })

  /**
   * GitHub repos + device match (WSS detect).
   * GitHub alone is never executor-ready — match must find a local path.
   */
  app.post('/api/projects/github-match', async (c) => {
    const owner = authed(kernel, c)
    return c.json(await kernel.listGithubReposWithDeviceMatch(owner))
  })

  app.get('/api/projects/:projectId', (c) => {
    const owner = authed(kernel, c)
    const project = kernel.getProject(owner, c.req.param('projectId'))
    if (!project) return c.json({ error: 'not found' }, 404)
    return c.json({ project })
  })

  app.post('/api/projects/:projectId/init/preview', async (c) => {
    const owner = authed(kernel, c)
    const body = await c.req.json().catch(() => ({}))
    return c.json(kernel.initPreview(owner, c.req.param('projectId'), body))
  })

  app.post('/api/projects/:projectId/init', async (c) => {
    const owner = authed(kernel, c)
    const body = await c.req.json().catch(() => ({}))
    return c.json({ project: kernel.initApply(owner, c.req.param('projectId'), body) })
  })

  app.get('/api/projects/:projectId/assignments', (c) => {
    const owner = authed(kernel, c)
    return c.json({ assignments: kernel.listAssignments(owner, c.req.param('projectId')) })
  })

  app.post('/api/projects/:projectId/assignments', async (c) => {
    const owner = authed(kernel, c)
    const body = await c.req.json()
    const row = kernel.createAssignment({
      ownerId: owner,
      projectId: c.req.param('projectId'),
      profileId: String(body.profileId),
      scheduleMode: String(body.scheduleMode ?? 'manual'),
      reviewMode: String(body.reviewMode ?? 'human'),
      runId: body.runId ?? null,
      executorId: body.executorId ?? null,
      cronExpr: body.cronExpr ?? null,
      fanOut: body.fanOut,
    })
    return c.json({ assignment: row }, 201)
  })

  /** Global assignments (projectId null) + fanOut */
  app.post('/api/assignments', async (c) => {
    const owner = authed(kernel, c)
    const body = await c.req.json()
    const row = kernel.createAssignment({
      ownerId: owner,
      projectId: body.projectId ?? null,
      profileId: String(body.profileId),
      scheduleMode: String(body.scheduleMode ?? 'manual'),
      reviewMode: String(body.reviewMode ?? 'human'),
      runId: body.runId ?? null,
      executorId: body.executorId ?? null,
      cronExpr: body.cronExpr ?? null,
      fanOut: body.fanOut,
    })
    return c.json({ assignment: row }, 201)
  })

  app.get('/api/assignments', (c) => {
    const owner = authed(kernel, c)
    const projectId = c.req.query('projectId')
    if (projectId === undefined) {
      return c.json({
        project: kernel.listAssignments(owner, null),
        note: 'pass projectId= for scoped; this lists globals only',
      })
    }
    if (projectId === '' || projectId === 'null') {
      return c.json({ assignments: kernel.listAssignments(owner, null) })
    }
    return c.json({ assignments: kernel.listAssignments(owner, projectId) })
  })

  app.patch('/api/assignments/:assignmentId', async (c) => {
    const owner = authed(kernel, c)
    const body = await c.req.json()
    return c.json({
      assignment: kernel.patchAssignment(owner, c.req.param('assignmentId'), body),
    })
  })

  app.delete('/api/assignments/:assignmentId', (c) => {
    const owner = authed(kernel, c)
    return c.json(kernel.deleteAssignment(owner, c.req.param('assignmentId')))
  })

  app.get('/api/assignments/:assignmentId/targets', (c) => {
    const owner = authed(kernel, c)
    return c.json(kernel.resolveFanOutTargets(owner, c.req.param('assignmentId')))
  })

  app.post('/api/assignments/:assignmentId/brief', (c) => {
    const owner = authed(kernel, c)
    const projectId = c.req.query('projectId')
    return c.json({
      brief: kernel.buildBrief(owner, c.req.param('assignmentId'), projectId || undefined),
    })
  })

  app.post('/api/assignments/:assignmentId/nudge', async (c) => {
    const owner = authed(kernel, c)
    const body = await c.req.json().catch(() => ({}))
    const run = await kernel.nudge(owner, c.req.param('assignmentId'), (body as { text?: string }).text)
    return c.json({ run }, 201)
  })

  app.post('/api/scheduler/tick', async (c) => {
    requireAdmin(kernel, c)
    return c.json(await kernel.schedulerTick())
  })

  app.get('/api/profiles', (c) => {
    authed(kernel, c)
    return c.json({
      profiles: kernel.listProfiles(),
      roles: kernel.listRoleFiles(),
      overlays: kernel.listOverlayFiles(),
    })
  })

  app.post('/api/profiles', async (c) => {
    requireAdmin(kernel, c)
    const body = await c.req.json()
    const profile = kernel.createProfile({
      id: String(body.id),
      label: String(body.label),
      rolePath: String(body.rolePath ?? body.role_path),
      overlay: body.overlay ?? body.lawpack_profile_overlay ?? null,
      defaultScheduleMode: body.defaultScheduleMode ?? body.default_schedule_mode,
      defaultReviewMode: body.defaultReviewMode ?? body.default_review_mode,
      defaultExecutorId: body.defaultExecutorId ?? body.default_executor_id ?? null,
    })
    return c.json({ profile }, 201)
  })

  app.patch('/api/profiles/:profileId', async (c) => {
    requireAdmin(kernel, c)
    const body = await c.req.json()
    const profile = kernel.updateProfile(c.req.param('profileId'), {
      label: body.label,
      rolePath: body.rolePath ?? body.role_path,
      overlay:
        body.overlay !== undefined
          ? body.overlay
          : body.lawpack_profile_overlay !== undefined
            ? body.lawpack_profile_overlay
            : undefined,
      defaultScheduleMode: body.defaultScheduleMode ?? body.default_schedule_mode,
      defaultReviewMode: body.defaultReviewMode ?? body.default_review_mode,
      defaultExecutorId: body.defaultExecutorId ?? body.default_executor_id,
    })
    return c.json({ profile })
  })

  app.delete('/api/profiles/:profileId', (c) => {
    requireAdmin(kernel, c)
    return c.json(kernel.deleteProfile(c.req.param('profileId')))
  })

  app.get('/api/runs', (c) => {
    const owner = authed(kernel, c)
    return c.json({ runs: kernel.listRuns(owner, c.req.query('projectId')) })
  })

  app.get('/api/runs/:runId', (c) => {
    const owner = authed(kernel, c)
    try {
      const run = kernel.requireRun(c.req.param('runId'), owner)
      return c.json({ run })
    } catch {
      return c.json({ error: 'not found' }, 404)
    }
  })

  app.post('/api/runs/:runId/approve', async (c) => {
    const owner = authed(kernel, c)
    const run = await kernel.approveRun(owner, c.req.param('runId'))
    return c.json({ run })
  })

  app.post('/api/runs/:runId/reject', async (c) => {
    const owner = authed(kernel, c)
    const body = (await c.req.json().catch(() => ({}))) as { reason?: string }
    return c.json({ run: kernel.rejectRun(owner, c.req.param('runId'), body.reason) })
  })

  app.get('/api/runs/:runId/transcript', async (c) => {
    const owner = authed(kernel, c)
    try {
      const transcript = await kernel.getRunTranscript(owner, c.req.param('runId'))
      return c.json(transcript)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const status = msg.includes('not found') ? 404 : 400
      return c.json({ error: msg }, status)
    }
  })

  app.get('/api/observability/attention', (c) => {
    const owner = authed(kernel, c)
    return c.json(kernel.attention(owner))
  })

  app.get('/api/observability/agents', (c) => {
    const owner = authed(kernel, c)
    return c.json(kernel.agentActivity(owner))
  })

  app.post('/api/chat', async (c) => {
    const owner = authed(kernel, c)
    const body = z
      .object({ message: z.string().min(1), projectId: z.string().optional() })
      .parse(await c.req.json())
    return c.json(
      await kernel.operatorChat(body.message, { projectId: body.projectId, ownerId: owner }),
    )
  })

  return app
}
