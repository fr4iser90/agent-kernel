const API = ''

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return json as T
}

export type PublicConfig = {
  authMode: string
  allowBootstrapRegister: boolean
  githubOAuthConfigured: boolean
  githubSignupMode: 'closed' | 'open' | 'allowlist'
  userCount: number
  authRequiredForApi: boolean
  loginOptional: boolean
  lawpackVersion?: string | null
  selfHostHint?: string
}

export type AuthResult = {
  token: string
  setupRequired: boolean
  setupGaps: string[]
  executorSetupRequired: boolean
  nextSetup: 'executor' | null
  nextPath: '/setup' | '/overview'
  role?: string | null
  githubLogin?: string
  provider?: string
}

export const api = {
  authConfig: () => req<PublicConfig>('/api/auth/config'),
  publicConfig: () => req<PublicConfig>('/api/public/config'),
  register: (username: string, password: string) =>
    req<AuthResult>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  loginPassword: (username: string, password: string) =>
    req<AuthResult>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ mode: 'password', username, password }),
    }),
  loginGithubPat: (pat: string) =>
    req<AuthResult>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ mode: 'github', token: pat }),
    }),
  githubOAuthUrl: '/api/auth/github',
  logout: () => req<{ ok: boolean }>('/api/auth/logout', { method: 'POST', body: '{}' }),
  me: () =>
    req<{
      ownerId: string
      username?: string | null
      role?: string | null
      setupGaps: string[]
      executorSetupRequired: boolean
      nextSetup: 'executor' | null
      nextPath: string
      provider?: string
      githubLogin?: string | null
      auth?: PublicConfig
    }>('/api/auth/me'),
  getMyExecutor: () => req<Record<string, unknown>>('/api/me/executor'),
  putMyExecutor: (body: Record<string, unknown>) =>
    req('/api/me/executor', { method: 'PUT', body: JSON.stringify(body) }),
  connectGuide: () =>
    req<{
      mode: 'outbound_wss'
      paired: boolean
      wssConnected: boolean
      heartbeat: { lastSeenAt: string | null; deviceLabel: string | null }
      notes: string[]
    }>('/api/me/executor/connect-guide'),
  startPair: () =>
    req<{
      code: string
      expiresAt: string
      kernelUrl: string
      pollIntervalMs: number
    }>('/api/me/pair/start', { method: 'POST', body: '{}' }),
  pairStatus: (code?: string) =>
    req<{
      status: 'pending' | 'claimed' | 'expired' | 'missing'
      code: string | null
      expiresAt: string | null
      claimedAt: string | null
      kernelUrl: string
    }>(`/api/me/pair/status${code ? `?code=${encodeURIComponent(code)}` : ''}`),
  getSettings: () => req<Record<string, unknown>>('/api/settings'),
  putSettings: (body: Record<string, unknown>) =>
    req('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),
  getDeployment: () =>
    req<{
      authRequiredForApi: boolean
      githubSignupMode: PublicConfig['githubSignupMode']
      githubSignupAllowlist: string[]
    }>('/api/admin/deployment'),
  putDeployment: (body: {
    authRequiredForApi?: boolean
    githubSignupMode?: PublicConfig['githubSignupMode']
    githubSignupAllowlist?: string[]
  }) => req('/api/admin/deployment', { method: 'PUT', body: JSON.stringify(body) }),
  testDsh: () => req('/api/settings/test-dsh', { method: 'POST', body: '{}' }),
  projects: () => req<{ projects: Project[] }>('/api/projects'),
  registerProject: (body: { name: string; path: string; gitRemote?: string }) =>
    req<{ project: Project }>('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
  detectProjects: () =>
    req<{
      candidates: Array<{ path: string; name: string; source: string; gitRemote?: string | null }>
      detectRoots: string[]
    }>('/api/projects/detect', { method: 'POST', body: '{}' }),
  githubMatch: () =>
    req<{
      detectRoots: string[]
      device: Array<{ path: string; name: string; source: string; gitRemote: string | null }>
      github: Array<{
        id: number
        name: string
        fullName: string
        private: boolean
        htmlUrl: string
        cloneUrl: string
        match: 'on_device' | 'missing'
        localPath: string | null
        matchReason: 'git_remote' | 'basename' | null
      }>
    }>('/api/projects/github-match', { method: 'POST', body: '{}' }),
  project: (id: string) => req<{ project: Project }>(`/api/projects/${id}`),
  sniff: (id: string) =>
    req<{ project: Project }>(`/api/projects/${id}/sniff`, { method: 'POST', body: '{}' }),
  analyze: (id: string) =>
    req<{ project: Project }>(`/api/projects/${id}/analyze`, { method: 'POST', body: '{}' }),
  scanLocal: (path: string, analyze = true) =>
    req<{
      registered: { id: string; name: string; path: string }[]
      skipped: { name: string; reason: string }[]
      analyzed: { id: string; name: string; advice: unknown }[]
    }>('/api/catalog/scan-local', {
      method: 'POST',
      body: JSON.stringify({ path, analyze }),
    }),
  importGithub: (body: {
    visibility: 'all' | 'public'
    login?: string
    clone?: boolean
    analyze?: boolean
    maxRepos?: number
  }) =>
    req<{
      visibility: string
      repoCount: number
      registered: string[]
      analyzed: string[]
      skipped: { name: string; reason: string }[]
    }>('/api/catalog/github/import', { method: 'POST', body: JSON.stringify(body) }),
  initPreview: (id: string, body: Record<string, unknown>) =>
    req(`/api/projects/${id}/init/preview`, { method: 'POST', body: JSON.stringify(body) }),
  initApply: (id: string, body: Record<string, unknown>) =>
    req<{ project: Project }>(`/api/projects/${id}/init`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  assignments: (projectId: string) =>
    req<{ assignments: Assignment[] }>(`/api/projects/${projectId}/assignments`),
  globalAssignments: () =>
    req<{ assignments: Assignment[] }>('/api/assignments?projectId='),
  createAssignment: (projectId: string, body: Record<string, unknown>) =>
    req<{ assignment: Assignment }>(`/api/projects/${projectId}/assignments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createGlobalAssignment: (body: Record<string, unknown>) =>
    req<{ assignment: Assignment }>('/api/assignments', {
      method: 'POST',
      body: JSON.stringify({ ...body, projectId: null }),
    }),
  brief: (assignmentId: string, projectId?: string) =>
    req(
      `/api/assignments/${assignmentId}/brief${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`,
      { method: 'POST', body: '{}' },
    ),
  nudge: (assignmentId: string, text?: string) =>
    req(`/api/assignments/${assignmentId}/nudge`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  deleteAssignment: (assignmentId: string) =>
    req<{ ok: boolean; id: string }>(`/api/assignments/${assignmentId}`, { method: 'DELETE' }),
  profiles: () =>
    req<{ profiles: Profile[]; roles: string[]; overlays: string[] }>('/api/profiles'),
  createProfile: (body: {
    id: string
    label: string
    rolePath: string
    overlay?: string | null
    defaultScheduleMode?: string
    defaultReviewMode?: string
  }) =>
    req<{ profile: Profile }>('/api/profiles', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateProfile: (
    id: string,
    body: {
      label?: string
      rolePath?: string
      overlay?: string | null
      defaultScheduleMode?: string
      defaultReviewMode?: string
    },
  ) =>
    req<{ profile: Profile }>(`/api/profiles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteProfile: (id: string) =>
    req<{ ok: boolean; id: string }>(`/api/profiles/${id}`, { method: 'DELETE' }),
  runs: (projectId?: string) =>
    req<{ runs: Run[] }>(`/api/runs${projectId ? `?projectId=${projectId}` : ''}`),
  run: (runId: string) => req<{ run: RunDetail }>(`/api/runs/${runId}`),
  approveRun: (runId: string) =>
    req<{ run: RunDetail }>(`/api/runs/${runId}/approve`, { method: 'POST', body: '{}' }),
  rejectRun: (runId: string, reason?: string) =>
    req<{ run: RunDetail }>(`/api/runs/${runId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  runTranscript: (runId: string) =>
    req<{
      run: RunDetail
      session: {
        sessionId: string
        running: boolean
        blank: boolean
        cwd: string | null
        agentPreset: string | null
        updatedAt: number
        title: string | null
      }
      historyPages: number
      eventCount: number
      messages: Array<{
        seq: number
        time: number
        role: string
        type: string
        text: string
        toolView?: unknown
      }>
      fileOps: Array<{
        seq: number
        time: number
        tool: string
        path: string | null
        summary: string
        view?: unknown
      }>
      rawEvents: unknown[]
      executorId: string
    }>(`/api/runs/${runId}/transcript`),
  patchAssignment: (
    assignmentId: string,
    body: {
      paused?: boolean
      cronExpr?: string | null
      scheduleMode?: string
      reviewMode?: string
      profileId?: string
      fanOut?: unknown
      runId?: string | null
    },
  ) =>
    req<{ assignment: Assignment }>(`/api/assignments/${assignmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  agentActivity: () => req<{ items: AgentActivityItem[] }>('/api/observability/agents'),
  attention: () => req<{ items: AttentionItem[] }>('/api/observability/attention'),
  chat: (message: string, projectId?: string) =>
    req<{ reply: string; toolResults: unknown[] }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, projectId }),
    }),
}

export type Project = {
  id: string
  name: string
  localPath: string
  gitRemote: string | null
  status: string
  lawpackVersion: string | null
  meta: Record<string, unknown>
}

export type Assignment = {
  id: string
  project_id: string | null
  profile_id: string
  schedule_mode: string
  review_mode: string
  cron_expr?: string | null
  run_id: string | null
  paused: number
}

export type Profile = {
  id: string
  label: string
  role_path: string
  lawpack_profile_overlay?: string | null
  default_schedule_mode?: string
  default_review_mode?: string
  default_executor_id?: string | null
}

export type Run = {
  id: string
  assignment_id: string
  project_id: string
  executor_id?: string
  executor_session_id: string | null
  outcome: string | null
  started_at: string
  ended_at?: string | null
  brief_hash?: string | null
  deny_reason?: string | null
}

export type RunDetail = Run & {
  brief_json?: string | null
}

export type AgentActivityItem = {
  assignmentId: string
  projectId: string | null
  projectName: string
  projectPath: string | null
  profileId: string
  profileLabel: string
  scheduleMode: string
  cronExpr: string | null
  reviewMode: string
  paused: boolean
  status: string
  latestRun: {
    id: string
    outcome: string | null
    startedAt: string
    endedAt: string | null
    executorSessionId: string | null
    briefHash: string | null
  } | null
}

export type AttentionItem = { kind: string; projectId: string; name: string; advice?: string[] }
