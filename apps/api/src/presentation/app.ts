import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie } from 'hono/cookie'
import { resolve } from 'node:path'
import { z } from 'zod'
import type { Kernel } from '../application/kernel.js'

const SESSION_COOKIE = 'ak_session'

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
  if (!info || info.role !== 'admin') throw new Error('unauthorized')
  return info.ownerId
}

/** Server catalog / executor APIs — session required when authRequiredForApi (or always for per-user data). */
function requireApiAuth(kernel: Kernel, c: Context): string {
  return authed(kernel, c)
}

export function createApp(kernel: Kernel): Hono {
  const app = new Hono()
  app.use(
    '*',
    cors({
      origin: (origin) => {
        const allowed = [
          'http://localhost:5173',
          'http://127.0.0.1:5173',
          process.env.WEB_ORIGIN,
        ].filter(Boolean) as string[]
        if (!origin) return allowed[0] ?? '*'
        return allowed.includes(origin) ? origin : allowed[0] ?? origin
      },
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
    setCookie(c, SESSION_COOKIE, result.token, {
      httpOnly: true,
      path: '/',
      sameSite: 'Lax',
    })
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
    }
    if (mode === 'password') {
      if (!body.username || !body.password) {
        return c.json({ error: 'username and password required' }, 400)
      }
      result = kernel.loginPassword(body.username, body.password)
    } else if (mode === 'github' || mode === 'github-pat') {
      const pat = body.token ?? body.pat
      if (!pat?.trim()) return c.json({ error: 'GitHub token/pat required' }, 400)
      result = await kernel.loginGithubPat(pat.trim())
    } else {
      return c.json({ error: `unknown login mode: ${mode} (use password or github)` }, 400)
    }
    setCookie(c, SESSION_COOKIE, result.token, {
      httpOnly: true,
      path: '/',
      sameSite: 'Lax',
      secure: process.env.COOKIE_SECURE === '1',
    })
    return c.json(result)
  })

  app.post('/api/auth/logout', (c) => {
    setCookie(c, SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
    return c.json({ ok: true })
  })

  app.get('/api/auth/github', (c) => {
    const { url } = kernel.githubOAuthStartUrl()
    return c.redirect(url, 302)
  })

  app.get('/api/auth/github/callback', async (c) => {
    const code = c.req.query('code')
    const state = c.req.query('state')
    if (!code || !state) return c.json({ error: 'missing code/state' }, 400)
    const result = await kernel.loginGithubOAuthCode(code, state)
    setCookie(c, SESSION_COOKIE, result.token, {
      httpOnly: true,
      path: '/',
      sameSite: 'Lax',
      secure: process.env.COOKIE_SECURE === '1',
    })
    const web = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:5173'
    return c.redirect(`${web}/?github=1`, 302)
  })

  app.get('/api/auth/me', (c) => {
    const info = kernel.sessionInfo(sessionToken(c))
    if (!info) throw new Error('unauthorized')
    return c.json({
      ownerId: info.ownerId,
      username: info.username,
      role: info.role,
      provider: info.provider,
      githubLogin: info.githubLogin,
      setupGaps: kernel.setupGapsForUser(info.ownerId),
      auth: kernel.authPublicConfig(),
    })
  })

  app.get('/api/me/executor', (c) => {
    const owner = requireApiAuth(kernel, c)
    const s = kernel.getUserExecutorSettings(owner)
    const { dshBasicAuthPassword, gatewayApiKey, ...safe } = s
    return c.json({
      ...safe,
      dshBasicAuthPassword: dshBasicAuthPassword ? '***' : null,
      gatewayApiKey: gatewayApiKey ? '***' : null,
      setupGaps: kernel.setupGapsForUser(owner),
    })
  })

  app.get('/api/me/executor/connect-guide', (c) => {
    const owner = authed(kernel, c)
    return c.json(kernel.executorConnectGuide(owner))
  })

  app.put('/api/me/executor', async (c) => {
    const owner = authed(kernel, c)
    const body = (await c.req.json()) as Record<string, unknown>
    const cur = kernel.getUserExecutorSettings(owner)
    if (body.dshBasicAuthPassword === '***') body.dshBasicAuthPassword = cur.dshBasicAuthPassword
    if (body.gatewayApiKey === '***') body.gatewayApiKey = cur.gatewayApiKey
    const saved = kernel.putUserExecutorSettings(owner, body as never)
    return c.json(saved)
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
    return c.json(saved)
  })

  app.get('/api/admin/deployment', (c) => {
    requireAdmin(kernel, c)
    const s = kernel.settings()
    return c.json({
      deploymentMode: s.deploymentMode,
      authRequiredForApi: s.authRequiredForApi,
      allowBootstrapRegister: s.allowBootstrapRegister,
      githubSignupMode: s.githubSignupMode,
      githubSignupAllowlist: s.githubSignupAllowlist,
      presets: {
        personal: { authRequiredForApi: false },
        hosted: { authRequiredForApi: true },
        hybrid: { authRequiredForApi: true },
      },
    })
  })

  app.put('/api/admin/deployment', async (c) => {
    requireAdmin(kernel, c)
    const body = (await c.req.json()) as {
      deploymentMode?: 'personal' | 'hosted' | 'hybrid'
      authRequiredForApi?: boolean
      allowBootstrapRegister?: boolean
      githubSignupMode?: 'closed' | 'open' | 'allowlist'
      githubSignupAllowlist?: string[]
    }
    const saved = kernel.putSettings({
      ...(body.deploymentMode ? { deploymentMode: body.deploymentMode } : {}),
      ...(body.authRequiredForApi !== undefined
        ? { authRequiredForApi: body.authRequiredForApi }
        : {}),
      ...(body.allowBootstrapRegister !== undefined
        ? { allowBootstrapRegister: body.allowBootstrapRegister }
        : {}),
      ...(body.githubSignupMode !== undefined
        ? { githubSignupMode: body.githubSignupMode }
        : {}),
      ...(body.githubSignupAllowlist !== undefined
        ? { githubSignupAllowlist: body.githubSignupAllowlist }
        : {}),
    })
    return c.json({
      deploymentMode: saved.deploymentMode,
      authRequiredForApi: saved.authRequiredForApi,
      allowBootstrapRegister: saved.allowBootstrapRegister,
      githubSignupMode: saved.githubSignupMode,
      githubSignupAllowlist: saved.githubSignupAllowlist,
    })
  })

  app.post('/api/settings/test-dsh', async (c) => {
    const owner = requireApiAuth(kernel, c)
    await kernel.pingDsh(owner)
    return c.json({ ok: true })
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

  app.get('/api/projects/:projectId', (c) => {
    authed(kernel, c)
    const project = kernel.getProject(c.req.param('projectId'))
    if (!project) return c.json({ error: 'not found' }, 404)
    return c.json({ project })
  })

  app.post('/api/projects/:projectId/sniff', (c) => {
    authed(kernel, c)
    return c.json({ project: kernel.sniff(c.req.param('projectId')) })
  })

  app.post('/api/projects/:projectId/analyze', (c) => {
    authed(kernel, c)
    return c.json({ project: kernel.analyze(c.req.param('projectId')) })
  })

  app.post('/api/catalog/scan-local', async (c) => {
    const owner = authed(kernel, c)
    const body = (await c.req.json()) as { path?: string; analyze?: boolean }
    const path = body.path ?? '/home/fr4iser/Documents/Git'
    const result = kernel.scanLocalProjects(owner, path)
    const all = kernel.listProjects(owner).filter((p) => p.localPath.startsWith(resolve(path)))
    const analyzedAll =
      body.analyze === false ? [] : all.map((p) => kernel.analyze(p.id))
    return c.json({
      registered: result.registered.map((p) => ({ id: p.id, name: p.name, path: p.localPath })),
      skipped: result.skipped,
      analyzed: analyzedAll.map((p) => ({ id: p.id, name: p.name, advice: p.meta.advice })),
    })
  })

  app.post('/api/catalog/github/import', async (c) => {
    const token =
      getCookie(c, SESSION_COOKIE) ??
      c.req.header('x-ak-session') ??
      c.req.header('authorization')?.replace(/^Bearer\s+/i, '')
    authed(kernel, c)
    const body = (await c.req.json()) as {
      visibility?: 'all' | 'public'
      login?: string
      clone?: boolean
      analyze?: boolean
      maxRepos?: number
    }
    const result = await kernel.importGithubProjects(token!, {
      visibility: body.visibility ?? 'all',
      login: body.login,
      clone: body.clone,
      analyze: body.analyze,
      maxRepos: body.maxRepos,
    })
    return c.json(result)
  })

  app.post('/api/projects/:projectId/init/preview', async (c) => {
    authed(kernel, c)
    const body = await c.req.json().catch(() => ({}))
    return c.json(kernel.initPreview(c.req.param('projectId'), body))
  })

  app.post('/api/projects/:projectId/init', async (c) => {
    authed(kernel, c)
    const body = await c.req.json().catch(() => ({}))
    return c.json({ project: kernel.initApply(c.req.param('projectId'), body) })
  })

  app.get('/api/projects/:projectId/assignments', (c) => {
    authed(kernel, c)
    return c.json({ assignments: kernel.listAssignments(c.req.param('projectId')) })
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
    authed(kernel, c)
    const projectId = c.req.query('projectId')
    if (projectId === undefined) {
      return c.json({
        project: kernel.listAssignments(null),
        note: 'pass projectId= for scoped; this lists globals only',
      })
    }
    if (projectId === '' || projectId === 'null') {
      return c.json({ assignments: kernel.listAssignments(null) })
    }
    return c.json({ assignments: kernel.listAssignments(projectId) })
  })

  app.patch('/api/assignments/:assignmentId', async (c) => {
    authed(kernel, c)
    const body = await c.req.json()
    return c.json({
      assignment: kernel.patchAssignment(c.req.param('assignmentId'), body),
    })
  })

  app.delete('/api/assignments/:assignmentId', (c) => {
    authed(kernel, c)
    return c.json(kernel.deleteAssignment(c.req.param('assignmentId')))
  })

  app.get('/api/assignments/:assignmentId/targets', (c) => {
    authed(kernel, c)
    return c.json(kernel.resolveFanOutTargets(c.req.param('assignmentId')))
  })

  app.post('/api/assignments/:assignmentId/brief', (c) => {
    authed(kernel, c)
    const projectId = c.req.query('projectId')
    return c.json({
      brief: kernel.buildBrief(c.req.param('assignmentId'), projectId || undefined),
    })
  })

  app.post('/api/assignments/:assignmentId/nudge', async (c) => {
    authed(kernel, c)
    const body = await c.req.json().catch(() => ({}))
    const run = await kernel.nudge(c.req.param('assignmentId'), (body as { text?: string }).text)
    return c.json({ run }, 201)
  })

  app.post('/api/scheduler/tick', async (c) => {
    authed(kernel, c)
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
    authed(kernel, c)
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
    authed(kernel, c)
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
    authed(kernel, c)
    return c.json(kernel.deleteProfile(c.req.param('profileId')))
  })

  app.get('/api/runs', (c) => {
    authed(kernel, c)
    return c.json({ runs: kernel.listRuns(c.req.query('projectId')) })
  })

  app.get('/api/runs/:runId', (c) => {
    authed(kernel, c)
    const run = kernel.getRun(c.req.param('runId'))
    if (!run) return c.json({ error: 'not found' }, 404)
    return c.json({ run })
  })

  app.post('/api/runs/:runId/approve', async (c) => {
    const owner = authed(kernel, c)
    const run = await kernel.approveRun(owner, c.req.param('runId'))
    return c.json({ run })
  })

  app.post('/api/runs/:runId/reject', async (c) => {
    authed(kernel, c)
    const body = (await c.req.json().catch(() => ({}))) as { reason?: string }
    return c.json({ run: kernel.rejectRun(c.req.param('runId'), body.reason) })
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
