export type DeploymentMode = 'personal' | 'hosted' | 'hybrid'

/** How new users may be created via GitHub OAuth/PAT. Existing users always may log in. */
export type GithubSignupMode = 'closed' | 'open' | 'allowlist'

export type AgentKernelSettings = {
  schemaVersion: number
  workspaceRoot: string | null
  executorId: string
  dshInvokeMode: 'cli' | 'host_http'
  dshEndpoint: string | null
  dshTrustedHost: string | null
  dshBasicAuthUser: string | null
  dshBasicAuthPassword: string | null
  dshCliRoot: string | null
  dshHome: string | null
  dshWorkdirHostPrefix: string | null
  dshWorkdirContainerPrefix: string | null
  /** GitHub OAuth App — product login identity + optional repo connect. */
  githubOAuthClientId: string | null
  githubOAuthClientSecret: string | null
  githubOAuthRedirectUri: string | null
  githubCloneRoot: string | null
  githubDefaultLogin: string | null
  /**
   * password_or_github: username/password and/or GitHub OAuth (only auth modes).
   */
  authMode: 'password_or_github'
  /** When true and no users exist, POST /api/auth/register creates first admin. */
  allowBootstrapRegister: boolean
  /**
   * closed (default) — GitHub login only for existing users (+ bootstrap when userCount=0).
   * open — OAuth/PAT may create new operator accounts.
   * allowlist — new accounts only if github login is listed.
   */
  githubSignupMode: GithubSignupMode
  /** GitHub logins allowed to self-register when githubSignupMode=allowlist (case-insensitive). */
  githubSignupAllowlist: string[]
  /**
   * personal — single-operator; authRequiredForApi defaults false.
   * hosted — multi-user; login required for API.
   * hybrid — public home + login for catalog/cron/executor (default).
   */
  deploymentMode: DeploymentMode
  /** Server catalog/cron/executor APIs require a session. */
  authRequiredForApi: boolean
  gatewayUrl: string | null
  gatewayApiKeyRef: string | null
  gatewayApiKey: string | null
  injectionMode: 'harness_inject' | 'repo_plant'
  injectStrength: 'strict' | 'hybrid'
  layoutPreset: 'vendor' | 'dot-agent' | 'custom'
  layoutPaths: Record<string, string>
  lawpackPinPolicy: string
  lawpackRoot: string | null
  createTrackingFiles: boolean
  createAgentsMd: boolean
  gitPolicyEnabled: boolean
  baselineBranch: string
  runIdPattern: string
  forbidRunIdForkSuffixes: string[]
  protectAssertRunId: boolean
  protectOwnedPaths: boolean
  installProtectHooks: boolean
  ownedPathsFile: string | null
  defaultPresetId: 'clean' | 'tracking' | 'offline'
  defaultProfileId: string
  defaultScheduleMode: 'infinite' | 'cron' | 'once' | 'on_event' | 'manual'
  defaultReviewMode: 'human' | 'llm_propose' | 'llm_auto'
  defaultCronExpr: string | null
  widgetLayout: unknown
  attentionRules: unknown
  setupCompleted: boolean
}

/** Apply deploymentMode presets (overridable by explicit flags in same patch). */
export function deploymentPresets(
  mode: DeploymentMode,
): Pick<AgentKernelSettings, 'authRequiredForApi'> {
  if (mode === 'personal') return { authRequiredForApi: false }
  return { authRequiredForApi: true }
}

export const DEFAULT_SETTINGS: AgentKernelSettings = {
  schemaVersion: 1,
  workspaceRoot: null,
  executorId: 'dsh',
  dshInvokeMode: 'host_http',
  dshEndpoint: null,
  dshTrustedHost: null,
  dshBasicAuthUser: null,
  dshBasicAuthPassword: null,
  dshCliRoot: null,
  dshHome: null,
  dshWorkdirHostPrefix: null,
  dshWorkdirContainerPrefix: null,
  githubOAuthClientId: null,
  githubOAuthClientSecret: null,
  githubOAuthRedirectUri: 'http://127.0.0.1:8787/api/auth/github/callback',
  githubCloneRoot: null,
  githubDefaultLogin: null,
  authMode: 'password_or_github',
  allowBootstrapRegister: true,
  githubSignupMode: 'closed',
  githubSignupAllowlist: [],
  deploymentMode: 'hybrid',
  authRequiredForApi: true,
  gatewayUrl: null,
  gatewayApiKeyRef: null,
  gatewayApiKey: null,
  injectionMode: 'harness_inject',
  injectStrength: 'hybrid',
  layoutPreset: 'dot-agent',
  layoutPaths: {
    lawpackDir: '.agent/lawpack',
    agentsMd: 'AGENTS.md',
    progress: 'PROGRESS.md',
    bugs: 'BUGS.md',
    adapter: 'ADAPTER.md',
  },
  lawpackPinPolicy: 'latest',
  lawpackRoot: null,
  createTrackingFiles: true,
  createAgentsMd: true,
  gitPolicyEnabled: false,
  baselineBranch: 'main',
  runIdPattern: 'agent/<slug>-YYYYMMDD',
  forbidRunIdForkSuffixes: ['-v2', '-p', '-rebased'],
  protectAssertRunId: false,
  protectOwnedPaths: false,
  installProtectHooks: false,
  ownedPathsFile: null,
  defaultPresetId: 'tracking',
  defaultProfileId: 'tracking-cycle',
  defaultScheduleMode: 'infinite',
  defaultReviewMode: 'human',
  defaultCronExpr: '0 3 * * *',
  widgetLayout: {},
  attentionRules: {},
  setupCompleted: false,
}

/** Global settings gaps — executor is per-user (BYO); not checked here. */
export function settingsSetupGaps(s: AgentKernelSettings): string[] {
  const gaps: string[] = []
  if (!s.setupCompleted) gaps.push('setupCompleted')
  void s
  return gaps
}

/** Gaps for this user's BYO executor — pair DSH (outbound); no Host-HTTP dial. */
export function userExecutorSetupGaps(s: {
  executorId: string
  executorPaired: boolean
}): string[] {
  const gaps: string[] = []
  if (!s.executorId) gaps.push('executorId')
  if (!s.executorPaired) gaps.push('executorPaired')
  return gaps
}
