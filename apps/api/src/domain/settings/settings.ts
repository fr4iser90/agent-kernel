/** How new users may be created via GitHub OAuth/PAT. Existing users always may log in. */
export type GithubSignupMode = 'closed' | 'open' | 'allowlist'

export type AgentKernelSettings = {
  schemaVersion: number
  executorId: string
  /** Unused for BYO outbound WSS — kept null in settings JSON. */
  dshInvokeMode: 'cli' | 'host_http'
  dshEndpoint: string | null
  dshTrustedHost: string | null
  dshBasicAuthUser: string | null
  dshBasicAuthPassword: string | null
  dshCliRoot: string | null
  dshHome: string | null
  /** GitHub OAuth App — product login identity. */
  githubOAuthClientId: string | null
  githubOAuthClientSecret: string | null
  githubOAuthRedirectUri: string | null
  githubDefaultLogin: string | null
  authMode: 'password_or_github'
  githubSignupMode: GithubSignupMode
  githubSignupAllowlist: string[]
  /** Default true. */
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
}

export const DEFAULT_SETTINGS: AgentKernelSettings = {
  schemaVersion: 1,
  executorId: 'dsh',
  dshInvokeMode: 'host_http',
  dshEndpoint: null,
  dshTrustedHost: null,
  dshBasicAuthUser: null,
  dshBasicAuthPassword: null,
  dshCliRoot: null,
  dshHome: null,
  githubOAuthClientId: null,
  githubOAuthClientSecret: null,
  githubOAuthRedirectUri: null,
  githubDefaultLogin: null,
  authMode: 'password_or_github',
  githubSignupMode: 'closed',
  githubSignupAllowlist: [],
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
}

export function userExecutorSetupGaps(s: {
  executorId: string
  executorPaired: boolean
}): string[] {
  const gaps: string[] = []
  if (!s.executorId) gaps.push('executorId')
  if (!s.executorPaired) gaps.push('executorPaired')
  return gaps
}
