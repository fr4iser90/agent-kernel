export type UserRole = 'admin' | 'operator'

export type User = {
  id: string
  username: string
  passwordHash: string | null
  githubId: string | null
  githubLogin: string | null
  githubAccessToken: string | null
  role: UserRole
  createdAt: string
  updatedAt: string
}

/** Where the in-app operator chat LLM runs (explicit — no silent fallback). */
export type OperatorLlmMode = 'executor' | 'gateway'

/**
 * Per-user BYO executor. Public product: DSH dials the kernel (pair + jobs).
 * Kernel never dials the user's DSH.
 */
export type UserExecutorSettings = {
  executorId: string
  /**
   * True after at least one successful device pair claim.
   * Cleared only if the user explicitly resets executor setup.
   */
  executorPaired: boolean
  /**
   * Operator-chat LLM backend.
   * - executor — default after pair; DSH runs a restricted operator turn (MCP tools only)
   * - gateway — OpenAI-compatible GateWay URL+key (chat without coding runtime)
   */
  operatorLlm: OperatorLlmMode
  /** Required when operatorLlm=gateway (also optional for llm_propose reviews). */
  gatewayUrl: string | null
  gatewayApiKey: string | null
}

export const DEFAULT_USER_EXECUTOR: UserExecutorSettings = {
  executorId: 'dsh',
  executorPaired: false,
  operatorLlm: 'executor',
  gatewayUrl: null,
  gatewayApiKey: null,
}

/** Drop removed Host-HTTP / SSH / connectMode fields from stored JSON. */
export function normalizeUserExecutorSettings(
  raw: Partial<UserExecutorSettings> & Record<string, unknown>,
): UserExecutorSettings {
  const {
    connectMode: _c,
    dshEndpoint: _e,
    dshTrustedHost: _th,
    dshLocalPort: _lp,
    dshBasicAuthUser: _bau,
    dshBasicAuthPassword: _bap,
    dshInvokeMode: _im,
    dshCliRoot: _cli,
    dshHome: _home,
    dshWorkdirHostPrefix: _wh,
    dshWorkdirContainerPrefix: _wc,
    tunnelRemotePort: _t,
    sshTunnelTarget: _s,
    ...rest
  } = raw as Partial<UserExecutorSettings> & Record<string, unknown>
  void _c
  void _e
  void _th
  void _lp
  void _bau
  void _bap
  void _im
  void _cli
  void _home
  void _wh
  void _wc
  void _t
  void _s
  const merged = { ...DEFAULT_USER_EXECUTOR, ...rest }
  merged.executorPaired = Boolean(merged.executorPaired)
  if (!merged.executorId) merged.executorId = 'dsh'
  const mode = String(merged.operatorLlm ?? 'executor')
  if (mode !== 'executor' && mode !== 'gateway') {
    throw new Error(`operatorLlm must be executor|gateway (got ${mode})`)
  }
  merged.operatorLlm = mode
  return {
    executorId: merged.executorId,
    executorPaired: merged.executorPaired,
    operatorLlm: merged.operatorLlm,
    gatewayUrl: merged.gatewayUrl ?? null,
    gatewayApiKey: merged.gatewayApiKey ?? null,
  }
}
