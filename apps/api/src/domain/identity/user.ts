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

/** How the user's local DSH is reached from a remote kernel. */
export type ExecutorConnectMode = 'public_url' | 'ssh_reverse' | 'vpn' | 'same_host'

/** Per-user BYO executor + optional GateWay (not global settings). */
export type UserExecutorSettings = {
  executorId: string
  dshInvokeMode: 'cli' | 'host_http'
  /** Reachability path — orthogonal to auth; guides setup + auto-fill. */
  connectMode: ExecutorConnectMode
  dshEndpoint: string | null
  dshTrustedHost: string | null
  /** Remote listen port on kernel host for SSH -R (ssh_reverse). */
  tunnelRemotePort: number | null
  /** Local DSH listen port on the user's machine (default 13080). */
  dshLocalPort: number | null
  /**
   * User's SSH destination for reverse tunnel, e.g. deploy@kernel.example.
   * Set by the user in Setup — not an operator-only env.
   */
  sshTunnelTarget: string | null
  dshBasicAuthUser: string | null
  dshBasicAuthPassword: string | null
  dshCliRoot: string | null
  dshHome: string | null
  dshWorkdirHostPrefix: string | null
  dshWorkdirContainerPrefix: string | null
  gatewayUrl: string | null
  gatewayApiKey: string | null
}

export const DEFAULT_USER_EXECUTOR: UserExecutorSettings = {
  executorId: 'dsh',
  dshInvokeMode: 'host_http',
  connectMode: 'public_url',
  dshEndpoint: null,
  dshTrustedHost: null,
  tunnelRemotePort: null,
  dshLocalPort: 13080,
  sshTunnelTarget: null,
  dshBasicAuthUser: null,
  dshBasicAuthPassword: null,
  dshCliRoot: null,
  dshHome: null,
  dshWorkdirHostPrefix: null,
  dshWorkdirContainerPrefix: null,
  gatewayUrl: null,
  gatewayApiKey: null,
}

/** Stable per-user remote port for SSH reverse tunnels. */
export function assignTunnelRemotePort(userId: string, base = 13100): number {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  return base + (h % 1000)
}
