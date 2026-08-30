import { createHash, randomUUID } from 'node:crypto'
import { execSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { SessionBrief } from '@agent-kernel/session-brief'
import type { ProjectRepository } from '../domain/catalog/project-repository.js'
import type { Project } from '../domain/catalog/project.js'
import {
  DEFAULT_USER_EXECUTOR,
  assignTunnelRemotePort,
  type ExecutorConnectMode,
  type User,
  type UserExecutorSettings,
} from '../domain/identity/user.js'
import {
  DEFAULT_SETTINGS,
  deploymentPresets,
  settingsSetupGaps,
  userExecutorSetupGaps,
  type AgentKernelSettings,
} from '../domain/settings/settings.js'
import { hashPassword, verifyPassword } from '../infrastructure/auth/password.js'
import { cronMatches } from '../infrastructure/cron.js'
import { DshHostClient } from '../infrastructure/dsh/dsh-host-client.js'
import { createExecutor } from '../infrastructure/executor/create-executor.js'
import { GitHubClient } from '../infrastructure/github/github-client.js'
import {
  cloneGithubRepo,
  fetchGithubReposForImport,
  registerScanResults,
  scanLocalGitRoots,
} from '../infrastructure/catalog/local-and-github.js'
import type { SqliteSettingsRepository } from '../infrastructure/sqlite/settings-repository.js'
import type Database from 'better-sqlite3'
import type { ExecutorPort } from '@agent-kernel/session-brief'
import { authorizeSessionStart, assertPolicyAllowed } from './policy-authorize.js'

export type FanOutSelector = {
  mode: 'all_initialized' | 'tag' | 'allow_list'
  tags?: string[]
  projectIds?: string[]
  excludeProjectIds?: string[]
  force?: boolean
}

function todayStamp(): string {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function runIdFromPattern(pattern: string, slug: string): string {
  return pattern.replaceAll('<slug>', slug).replaceAll('YYYYMMDD', todayStamp())
}

export type KernelDeps = {
  db: Database.Database
  projects: ProjectRepository
  settingsRepo: SqliteSettingsRepository
  repoRoot: string
}

export class Kernel {
  constructor(private readonly deps: KernelDeps) {
    this.seedProfiles()
    this.hydrateOAuthFromEnv()
  }

  private hydrateOAuthFromEnv(): void {
    const id = process.env.GITHUB_CLIENT_ID?.trim()
    const secret = process.env.GITHUB_CLIENT_SECRET?.trim()
    const redirect = process.env.GITHUB_REDIRECT_URI?.trim()
    if (!id && !secret && !redirect) return
    const cur = this.settings()
    const patch: Partial<AgentKernelSettings> = {}
    if (id && !cur.githubOAuthClientId) patch.githubOAuthClientId = id
    if (secret && !cur.githubOAuthClientSecret) patch.githubOAuthClientSecret = secret
    if (redirect) patch.githubOAuthRedirectUri = redirect
    if (Object.keys(patch).length) this.putSettings(patch)
  }

  settings(): AgentKernelSettings {
    return this.deps.settingsRepo.get()
  }

  putSettings(patch: Partial<AgentKernelSettings>): AgentKernelSettings {
    const cur = this.settings()
    const next: AgentKernelSettings = {
      ...cur,
      ...patch,
      layoutPaths: { ...cur.layoutPaths, ...(patch.layoutPaths ?? {}) },
      schemaVersion: 1,
    }
    if (patch.deploymentMode && patch.deploymentMode !== cur.deploymentMode) {
      const presets = deploymentPresets(patch.deploymentMode)
      if (patch.authRequiredForApi === undefined) {
        next.authRequiredForApi = presets.authRequiredForApi
      }
    }
    if (next.dshEndpoint && !next.dshTrustedHost) {
      try {
        next.dshTrustedHost = new URL(next.dshEndpoint).host
      } catch {
        /* keep null */
      }
    }
    if (patch.githubSignupMode !== undefined) {
      if (!['closed', 'open', 'allowlist'].includes(next.githubSignupMode)) {
        throw new Error('githubSignupMode must be closed | open | allowlist')
      }
    }
    if (patch.githubSignupAllowlist !== undefined) {
      next.githubSignupAllowlist = (patch.githubSignupAllowlist ?? [])
        .map((x) => String(x).trim().replace(/^@/, ''))
        .filter(Boolean)
    }
    return this.deps.settingsRepo.put(next)
  }

  setupGaps(): string[] {
    return settingsSetupGaps(this.settings())
  }

  requireSetup(): void {
    const gaps = this.setupGaps()
    if (gaps.length) {
      throw new Error(`Setup incomplete: ${gaps.join(', ')}. Finish setup wizard / Settings.`)
    }
  }

  userCount(): number {
    const row = this.deps.db.prepare(`SELECT COUNT(*) AS c FROM users`).get() as { c: number }
    return row.c
  }

  private rowToUser(row: Record<string, unknown>): User {
    return {
      id: String(row.id),
      username: String(row.username),
      passwordHash: row.password_hash == null ? null : String(row.password_hash),
      githubId: row.github_id == null ? null : String(row.github_id),
      githubLogin: row.github_login == null ? null : String(row.github_login),
      githubAccessToken: row.github_access_token == null ? null : String(row.github_access_token),
      role: (row.role as User['role']) ?? 'operator',
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }
  }

  getUser(id: string): User | null {
    const row = this.deps.db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined
    return row ? this.rowToUser(row) : null
  }

  getUserByUsername(username: string): User | null {
    const row = this.deps.db
      .prepare(`SELECT * FROM users WHERE lower(username) = lower(?)`)
      .get(username) as Record<string, unknown> | undefined
    return row ? this.rowToUser(row) : null
  }

  authPublicConfig() {
    const s = this.settings()
    return {
      authMode: s.authMode,
      allowBootstrapRegister: s.allowBootstrapRegister && this.userCount() === 0,
      githubOAuthConfigured: Boolean(
        (s.githubOAuthClientId || process.env.GITHUB_CLIENT_ID)?.trim(),
      ),
      githubSignupMode: s.githubSignupMode,
      userCount: this.userCount(),
      deploymentMode: s.deploymentMode,
      authRequiredForApi: s.authRequiredForApi,
      loginOptional: !s.authRequiredForApi || s.deploymentMode !== 'hosted',
    }
  }

  /** Public deployment flags (no secrets). */
  publicDeploymentConfig() {
    const s = this.settings()
    const lawpackRoot = s.lawpackRoot?.trim() || join(this.deps.repoRoot, 'lawpack')
    let lawpackVersion: string | null = null
    try {
      const man = JSON.parse(readFileSync(join(lawpackRoot, 'MANIFEST.json'), 'utf8')) as {
        version?: string
      }
      lawpackVersion = man.version ?? null
    } catch {
      lawpackVersion = null
    }
    return {
      ...this.authPublicConfig(),
      lawpackVersion,
      selfHostHint: 'git clone the agent-kernel repo and run deploy/compose.yml (same product).',
    }
  }

  createSession(
    ownerId: string,
    opts?: { provider?: string; githubLogin?: string | null; accessToken?: string | null },
  ): string {
    const token = randomUUID()
    this.deps.db
      .prepare(
        `INSERT INTO sessions (token, owner_id, created_at, provider, github_login, access_token)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        token,
        ownerId,
        new Date().toISOString(),
        opts?.provider ?? 'password',
        opts?.githubLogin ?? null,
        opts?.accessToken ?? null,
      )
    return token
  }

  ownerFromToken(token: string | undefined | null): string | null {
    if (!token) return null
    const row = this.deps.db.prepare(`SELECT owner_id FROM sessions WHERE token = ?`).get(token) as
      | { owner_id: string }
      | undefined
    return row?.owner_id ?? null
  }

  sessionInfo(token: string | undefined | null): {
    ownerId: string
    provider: string
    githubLogin: string | null
    username: string | null
    role: string | null
  } | null {
    if (!token) return null
    const row = this.deps.db
      .prepare(`SELECT owner_id, provider, github_login FROM sessions WHERE token = ?`)
      .get(token) as
      | { owner_id: string; provider: string; github_login: string | null }
      | undefined
    if (!row) return null
    const user = this.getUser(row.owner_id)
    if (!user) return null
    return {
      ownerId: row.owner_id,
      provider: row.provider ?? 'password',
      githubLogin: row.github_login ?? user.githubLogin ?? null,
      username: user.username,
      role: user.role,
    }
  }

  private accessTokenFor(sessionToken: string | undefined | null): string | null {
    if (!sessionToken) return null
    const row = this.deps.db
      .prepare(`SELECT access_token FROM sessions WHERE token = ?`)
      .get(sessionToken) as { access_token: string | null } | undefined
    if (row?.access_token) return row.access_token
    const owner = this.ownerFromToken(sessionToken)
    if (!owner) return null
    return this.getUser(owner)?.githubAccessToken ?? null
  }

  private authLoginResult(user: User, provider: string, accessToken?: string | null) {
    const token = this.createSession(user.id, {
      provider,
      githubLogin: user.githubLogin,
      accessToken: accessToken ?? user.githubAccessToken,
    })
    const gaps = this.setupGapsForUser(user.id)
    return {
      token,
      ownerId: user.id,
      username: user.username,
      role: user.role,
      githubLogin: user.githubLogin,
      provider,
      setupRequired: gaps.length > 0,
      setupGaps: gaps,
    }
  }

  setupGapsForUser(userId: string): string[] {
    if (!this.getUser(userId)) {
      throw new Error('unauthorized')
    }
    return userExecutorSetupGaps(this.getUserExecutorSettings(userId))
  }

  /** First user (bootstrap) or admin-created later. */
  registerPasswordUser(input: {
    username: string
    password: string
    role?: User['role']
    bootstrap?: boolean
  }): ReturnType<Kernel['authLoginResult']> {
    const username = input.username.trim()
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
      throw new Error('username must be 3–32 chars [a-zA-Z0-9_.-]')
    }
    const count = this.userCount()
    const s = this.settings()
    if (count === 0) {
      if (!s.allowBootstrapRegister && !input.bootstrap) {
        throw new Error('bootstrap register disabled')
      }
    } else if (input.bootstrap) {
      throw new Error('bootstrap only when no users exist')
    } else {
      throw new Error('registration closed — ask an admin (use GitHub login or admin invite later)')
    }
    if (this.getUserByUsername(username)) throw new Error('username taken')
    const id = randomUUID()
    const now = new Date().toISOString()
    const role = count === 0 ? 'admin' : (input.role ?? 'operator')
    this.deps.db
      .prepare(
        `INSERT INTO users (id, username, password_hash, github_id, github_login, github_access_token, role, created_at, updated_at)
         VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
      )
      .run(id, username, hashPassword(input.password), role, now, now)
    this.ensureUserSettings(id)
    const user = this.getUser(id)!
    return this.authLoginResult(user, 'password')
  }

  loginPassword(username: string, password: string) {
    const user = this.getUserByUsername(username.trim())
    if (!user?.passwordHash) throw new Error('invalid username or password')
    if (!verifyPassword(password, user.passwordHash)) {
      throw new Error('invalid username or password')
    }
    return this.authLoginResult(user, 'password')
  }

  private upsertGithubUser(me: { id: number; login: string }, accessToken: string): User {
    const githubId = String(me.id)
    const existing = this.deps.db
      .prepare(`SELECT * FROM users WHERE github_id = ?`)
      .get(githubId) as Record<string, unknown> | undefined
    const now = new Date().toISOString()
    if (existing) {
      this.deps.db
        .prepare(
          `UPDATE users SET github_login = ?, github_access_token = ?, updated_at = ? WHERE id = ?`,
        )
        .run(me.login, accessToken, now, existing.id)
      return this.getUser(String(existing.id))!
    }
    const byName = this.getUserByUsername(me.login)
    if (byName) {
      this.deps.db
        .prepare(
          `UPDATE users SET github_id = ?, github_login = ?, github_access_token = ?, updated_at = ? WHERE id = ?`,
        )
        .run(githubId, me.login, accessToken, now, byName.id)
      return this.getUser(byName.id)!
    }

    // New account — gated by githubSignupMode (default closed).
    const count = this.userCount()
    const s = this.settings()
    if (count === 0) {
      if (!s.allowBootstrapRegister) {
        throw new Error('bootstrap register disabled — create the first admin another way')
      }
    } else if (s.githubSignupMode === 'closed') {
      throw new Error(
        'GitHub signup closed — existing accounts may log in; ask an admin to open signup or add an allowlist',
      )
    } else if (s.githubSignupMode === 'allowlist') {
      const allowed = new Set(
        (s.githubSignupAllowlist ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean),
      )
      if (!allowed.has(me.login.toLowerCase())) {
        throw new Error(`GitHub login @${me.login} is not on the signup allowlist`)
      }
    } else if (s.githubSignupMode !== 'open') {
      throw new Error(`Unknown githubSignupMode=${s.githubSignupMode}`)
    }

    const id = randomUUID()
    const role = count === 0 ? 'admin' : 'operator'
    let username = me.login
    if (this.getUserByUsername(username)) username = `${me.login}-${githubId.slice(-4)}`
    this.deps.db
      .prepare(
        `INSERT INTO users (id, username, password_hash, github_id, github_login, github_access_token, role, created_at, updated_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, username, githubId, me.login, accessToken, role, now, now)
    this.ensureUserSettings(id)
    return this.getUser(id)!
  }

  async loginGithubPat(pat: string) {
    const gh = new GitHubClient(pat)
    const me = await gh.me()
    const user = this.upsertGithubUser(me, pat)
    return this.authLoginResult(user, 'github', pat)
  }

  githubOAuthStartUrl(): { url: string; state: string } {
    const s = this.settings()
    const clientId =
      s.githubOAuthClientId?.trim() || process.env.GITHUB_CLIENT_ID?.trim() || null
    const redirect =
      s.githubOAuthRedirectUri?.trim() ||
      process.env.GITHUB_REDIRECT_URI?.trim() ||
      'http://127.0.0.1:8787/api/auth/github/callback'
    if (!clientId) {
      throw new Error('GitHub OAuth not configured — set githubOAuthClientId / GITHUB_CLIENT_ID')
    }
    const state = randomUUID()
    this.deps.db
      .prepare(
        `INSERT INTO kv (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(`oauth_state:${state}`, String(Date.now()))
    return { url: GitHubClient.oauthAuthorizeUrl(clientId, redirect, state), state }
  }

  async loginGithubOAuthCode(code: string, state: string) {
    const st = this.deps.db.prepare(`SELECT value FROM kv WHERE key = ?`).get(`oauth_state:${state}`) as
      | { value: string }
      | undefined
    if (!st) throw new Error('invalid OAuth state')
    this.deps.db.prepare(`DELETE FROM kv WHERE key = ?`).run(`oauth_state:${state}`)
    const s = this.settings()
    const clientId =
      s.githubOAuthClientId?.trim() || process.env.GITHUB_CLIENT_ID?.trim() || ''
    const clientSecret =
      s.githubOAuthClientSecret?.trim() || process.env.GITHUB_CLIENT_SECRET?.trim() || ''
    const redirect =
      s.githubOAuthRedirectUri?.trim() ||
      process.env.GITHUB_REDIRECT_URI?.trim() ||
      'http://127.0.0.1:8787/api/auth/github/callback'
    if (!clientId || !clientSecret) throw new Error('GitHub OAuth client id/secret missing')
    const tok = await GitHubClient.exchangeOAuthCode({
      clientId,
      clientSecret,
      code,
      redirectUri: redirect,
    })
    return this.loginGithubPat(tok.access_token)
  }

  ensureUserSettings(userId: string): void {
    const row = this.deps.db
      .prepare(`SELECT user_id FROM user_settings WHERE user_id = ?`)
      .get(userId)
    if (row) return
    this.deps.db
      .prepare(`INSERT INTO user_settings (user_id, doc_json, updated_at) VALUES (?, ?, ?)`)
      .run(userId, JSON.stringify(DEFAULT_USER_EXECUTOR), new Date().toISOString())
  }

  getUserExecutorSettings(userId: string): UserExecutorSettings {
    this.ensureUserSettings(userId)
    const row = this.deps.db
      .prepare(`SELECT doc_json FROM user_settings WHERE user_id = ?`)
      .get(userId) as { doc_json: string }
    const parsed = JSON.parse(row.doc_json) as Partial<UserExecutorSettings>
    return { ...DEFAULT_USER_EXECUTOR, ...parsed }
  }

  putUserExecutorSettings(
    userId: string,
    patch: Partial<UserExecutorSettings>,
  ): UserExecutorSettings {
    const cur = this.getUserExecutorSettings(userId)
    const next: UserExecutorSettings = { ...cur, ...patch }
    const localPort = next.dshLocalPort ?? 13080
    next.dshLocalPort = localPort

    if (next.connectMode === 'ssh_reverse' && next.dshInvokeMode === 'host_http') {
      const base = Number(process.env.EXECUTOR_SSH_TUNNEL_PORT_BASE ?? 13100)
      if (!next.tunnelRemotePort) next.tunnelRemotePort = assignTunnelRemotePort(userId, base)
      const reachHost =
        process.env.EXECUTOR_SSH_TUNNEL_ENDPOINT_HOST?.trim() || 'host.docker.internal'
      if (!next.dshEndpoint) {
        next.dshEndpoint = `http://${reachHost}:${next.tunnelRemotePort}`
      }
      // Host header must match DSH TRUSTED_HOST on the user's machine (usually localhost:13080).
      if (!next.dshTrustedHost) next.dshTrustedHost = `localhost:${localPort}`
    } else if (next.connectMode === 'same_host' && next.dshInvokeMode === 'host_http') {
      if (!next.dshEndpoint) next.dshEndpoint = `http://127.0.0.1:${localPort}`
      if (!next.dshTrustedHost) next.dshTrustedHost = `localhost:${localPort}`
    } else if (next.dshEndpoint && !next.dshTrustedHost) {
      try {
        next.dshTrustedHost = new URL(next.dshEndpoint).host
      } catch {
        /* keep null */
      }
    }

    this.deps.db
      .prepare(
        `INSERT INTO user_settings (user_id, doc_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET doc_json = excluded.doc_json, updated_at = excluded.updated_at`,
      )
      .run(userId, JSON.stringify(next), new Date().toISOString())
    return next
  }

  /** Setup hints for public URL / SSH reverse / VPN — kernel never builds the tunnel itself. */
  executorConnectGuide(userId: string): {
    connectMode: ExecutorConnectMode
    modes: Array<{
      id: ExecutorConnectMode
      title: string
      summary: string
    }>
    ssh: {
      configured: boolean
      sshTarget: string | null
      remotePort: number
      localPort: number
      endpoint: string
      trustedHost: string
      command: string
      notes: string[]
    }
    vpn: {
      endpointHint: string
      trustedHostHint: string
      notes: string[]
    }
    publicUrl: { notes: string[] }
    sameHost: { notes: string[] }
  } {
    const s = this.getUserExecutorSettings(userId)
    const base = Number(process.env.EXECUTOR_SSH_TUNNEL_PORT_BASE ?? 13100)
    const remotePort = s.tunnelRemotePort ?? assignTunnelRemotePort(userId, base)
    const localPort = s.dshLocalPort ?? 13080
    // Prefer per-user Setup field; optional deploy default only as fallback hint.
    const sshTarget =
      s.sshTunnelTarget?.trim() ||
      process.env.EXECUTOR_SSH_TUNNEL_TARGET?.trim() ||
      null
    const reachHost =
      process.env.EXECUTOR_SSH_TUNNEL_ENDPOINT_HOST?.trim() || 'host.docker.internal'
    const target = sshTarget ?? 'user@your-kernel-server'
    const command = `ssh -N -R ${remotePort}:127.0.0.1:${localPort} ${target}`
    return {
      connectMode: s.connectMode,
      modes: [
        {
          id: 'public_url',
          title: 'Public / Traefik URL',
          summary: 'DSH already has a reachable HTTPS URL (Basic Auth optional).',
        },
        {
          id: 'ssh_reverse',
          title: 'SSH reverse tunnel',
          summary: 'DSH only on localhost — you open a reverse tunnel from your PC.',
        },
        {
          id: 'vpn',
          title: 'VPN (e.g. Tailscale)',
          summary: 'PC + server share a private IP — put that IP:port as endpoint.',
        },
        {
          id: 'same_host',
          title: 'Same machine',
          summary: 'Kernel and DSH on one host — localhost is fine.',
        },
      ],
      ssh: {
        configured: Boolean(sshTarget),
        sshTarget,
        remotePort,
        localPort,
        endpoint: `http://${reachHost}:${remotePort}`,
        trustedHost: `localhost:${localPort}`,
        command,
        notes: [
          'You set the SSH target yourself in Setup (e.g. deploy@your-server) — the kernel only stores it to show the command.',
          'Start DSH locally first, then keep this SSH command running (or use scripts/dsh-reverse-tunnel.sh / autossh).',
          'sshd on the kernel host needs GatewayPorts clientspecified (or yes) so Docker can reach the forwarded port.',
          'dshTrustedHost must match DSH TRUSTED_HOST (usually localhost:13080); endpoint is only how the kernel reaches the tunnel.',
        ],
      },
      vpn: {
        endpointHint: `http://100.x.y.z:${localPort}`,
        trustedHostHint: `localhost:${localPort}`,
        notes: [
          'Install Tailscale (or WireGuard) on your PC and the kernel host.',
          'Use your PC’s VPN IP as dshEndpoint; keep dshTrustedHost = DSH TRUSTED_HOST (often localhost:PORT).',
        ],
      },
      publicUrl: {
        notes: [
          'Paste the full DSH base URL. If behind Traefik Basic Auth, fill user/password.',
          'When endpoint host equals what DSH trusts, set dshTrustedHost to that same host:port.',
        ],
      },
      sameHost: {
        notes: [
          'Only when the API process can dial 127.0.0.1 on this machine (L-native or API not in a remote container).',
          'Server kernel + DSH on your PC → use ssh_reverse or vpn. Do not invent host-gateway / port publishes.',
        ],
      },
    }
  }

  listProjects(ownerId: string): Project[] {
    return this.deps.projects.listByOwner(ownerId)
  }

  scanLocalProjects(ownerId: string, rootPath: string) {
    const found = scanLocalGitRoots(rootPath)
    return registerScanResults(this.deps.projects, ownerId, found)
  }

  async importGithubProjects(
    sessionToken: string,
    opts: {
      visibility: 'all' | 'public'
      login?: string
      clone?: boolean
      analyze?: boolean
      maxRepos?: number
    },
  ) {
    const info = this.sessionInfo(sessionToken)
    if (!info) throw new Error('unauthorized')
    const token = this.accessTokenFor(sessionToken)
    if (!token) {
      throw new Error('GitHub session required — login via GitHub (PAT or OAuth)')
    }
    const s = this.settings()
    const cloneRoot =
      s.githubCloneRoot?.trim() ||
      join(s.workspaceRoot ?? join(this.deps.repoRoot, 'data', 'github-clones'))
    let repos = await fetchGithubReposForImport(token, {
      visibility: opts.visibility,
      login: opts.login ?? s.githubDefaultLogin ?? undefined,
    })
    if (opts.visibility === 'all') {
      // keep private + public owned
    } else {
      repos = repos.filter((r) => !r.private)
    }
    if (opts.maxRepos && opts.maxRepos > 0) {
      repos = repos.slice(0, opts.maxRepos)
    }
    const registered = []
    const skipped = []
    const analyzed = []
    for (const repo of repos) {
      try {
        let localPath: string
        if (opts.clone !== false) {
          localPath = cloneGithubRepo({ repo, cloneRoot, token })
        } else {
          localPath = join(cloneRoot, repo.name)
          if (!existsSync(localPath)) {
            skipped.push({ name: repo.full_name, reason: 'not_cloned' })
            continue
          }
        }
        const existing = this.deps.projects
          .listByOwner(info.ownerId)
          .find((p) => p.localPath === localPath || p.gitRemote === repo.clone_url)
        let project = existing
        if (!project) {
          project = this.deps.projects.create({
            id: randomUUID(),
            ownerId: info.ownerId,
            name: repo.name,
            localPath,
            gitRemote: repo.clone_url,
            now: new Date().toISOString(),
          })
          registered.push(project)
        } else {
          skipped.push({ name: repo.full_name, reason: 'already_registered' })
        }
        if (opts.analyze !== false && project) {
          analyzed.push(this.analyze(project.id))
        }
      } catch (e) {
        skipped.push({
          name: repo.full_name,
          reason: e instanceof Error ? e.message : String(e),
        })
      }
    }
    return {
      visibility: opts.visibility,
      repoCount: repos.length,
      registered: registered.map((p) => p.id),
      analyzed: analyzed.map((p) => p.id),
      skipped,
    }
  }

  analyzeMany(projectIds: string[]) {
    return projectIds.map((id) => this.analyze(id))
  }

  getProject(id: string): Project | null {
    return this.deps.projects.getById(id)
  }

  registerProject(
    ownerId: string,
    input: { name: string; localPath?: string; path?: string; gitRemote?: string | null },
  ): Project {
    const localPath = input.localPath ?? input.path
    if (!localPath) throw new Error('path / localPath required')
    const abs = resolve(localPath)
    if (!existsSync(abs)) throw new Error(`path does not exist: ${abs}`)
    return this.deps.projects.create({
      id: randomUUID(),
      ownerId,
      name: input.name,
      localPath: abs,
      gitRemote: input.gitRemote ?? null,
      now: new Date().toISOString(),
    })
  }

  private lawpackRoot(s: AgentKernelSettings): string {
    if (s.lawpackRoot) return resolve(s.lawpackRoot)
    return resolve(this.deps.repoRoot, 'lawpack')
  }

  private seedProfiles(): void {
    const count = this.deps.db.prepare(`SELECT COUNT(*) AS c FROM profiles`).get() as { c: number }
    if (count.c > 0) return
    const seeds = [
      {
        id: 'tracking-cycle',
        label: 'Tracking cycle',
        role_path: 'roles/followup.md',
        overlay: null as string | null,
      },
      { id: 'docs-only', label: 'Docs', role_path: 'roles/docs.md', overlay: 'web-compliance' },
      {
        id: 'legal-impressum',
        label: 'Legal / Impressum',
        role_path: 'roles/legal-impressum.md',
        overlay: 'web-compliance',
      },
      {
        id: 'security-sweep',
        label: 'Security sweep',
        role_path: 'roles/security.md',
        overlay: 'web-compliance',
      },
      { id: 'fix-only', label: 'Fix only', role_path: 'roles/fix.md', overlay: null },
      { id: 'games-cycle', label: 'Games cycle', role_path: 'roles/followup.md', overlay: 'games' },
    ]
    const ins = this.deps.db.prepare(
      `INSERT INTO profiles (id, label, role_path, lawpack_profile_overlay, default_schedule_mode, default_review_mode, default_executor_id, doc_json)
       VALUES (@id, @label, @role_path, @overlay, 'infinite', 'human', 'dsh', '{}')`,
    )
    for (const s of seeds) {
      ins.run({
        id: s.id,
        label: s.label,
        role_path: s.role_path,
        overlay: s.overlay,
      })
    }
  }

  listProfiles() {
    return this.deps.db.prepare(`SELECT * FROM profiles ORDER BY id`).all()
  }

  getProfile(id: string) {
    return this.deps.db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined
  }

  createProfile(input: {
    id: string
    label: string
    rolePath: string
    overlay?: string | null
    defaultScheduleMode?: string
    defaultReviewMode?: string
    defaultExecutorId?: string | null
  }) {
    const id = input.id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
    if (!id) throw new Error('profile id required')
    if (this.getProfile(id)) throw new Error(`profile already exists: ${id}`)
    const label = input.label.trim()
    if (!label) throw new Error('profile label required')
    const rolePath = input.rolePath.trim().replace(/^\/+/, '')
    if (!rolePath) throw new Error('rolePath required')
    const pack = this.lawpackRoot(this.settings())
    const roleAbs = join(pack, rolePath)
    if (!existsSync(roleAbs)) throw new Error(`role file missing: ${roleAbs}`)
    if (input.overlay) {
      const overlayAbs = join(pack, 'profiles', `${input.overlay}.md`)
      if (!existsSync(overlayAbs)) throw new Error(`overlay missing: ${overlayAbs}`)
    }
    const schedule = input.defaultScheduleMode ?? 'manual'
    const review = input.defaultReviewMode ?? 'human'
    this.assertScheduleMode(schedule)
    this.assertReviewMode(review)
    this.deps.db
      .prepare(
        `INSERT INTO profiles (id, label, role_path, lawpack_profile_overlay, default_schedule_mode, default_review_mode, default_executor_id, doc_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, '{}')`,
      )
      .run(
        id,
        label,
        rolePath,
        input.overlay ?? null,
        schedule,
        review,
        input.defaultExecutorId ?? this.settings().executorId,
      )
    return this.getProfile(id)!
  }

  updateProfile(
    id: string,
    patch: {
      label?: string
      rolePath?: string
      overlay?: string | null
      defaultScheduleMode?: string
      defaultReviewMode?: string
      defaultExecutorId?: string | null
    },
  ) {
    const cur = this.getProfile(id)
    if (!cur) throw new Error(`profile not found: ${id}`)
    const pack = this.lawpackRoot(this.settings())
    const label = patch.label !== undefined ? patch.label.trim() : String(cur.label)
    if (!label) throw new Error('profile label required')
    const rolePath =
      patch.rolePath !== undefined
        ? patch.rolePath.trim().replace(/^\/+/, '')
        : String(cur.role_path)
    if (!rolePath) throw new Error('rolePath required')
    if (!existsSync(join(pack, rolePath))) throw new Error(`role file missing: ${join(pack, rolePath)}`)
    const overlay =
      patch.overlay !== undefined ? patch.overlay : (cur.lawpack_profile_overlay as string | null)
    if (overlay) {
      const overlayAbs = join(pack, 'profiles', `${overlay}.md`)
      if (!existsSync(overlayAbs)) throw new Error(`overlay missing: ${overlayAbs}`)
    }
    const schedule = patch.defaultScheduleMode ?? String(cur.default_schedule_mode)
    const review = patch.defaultReviewMode ?? String(cur.default_review_mode)
    this.assertScheduleMode(schedule)
    this.assertReviewMode(review)
    this.deps.db
      .prepare(
        `UPDATE profiles SET label = ?, role_path = ?, lawpack_profile_overlay = ?,
         default_schedule_mode = ?, default_review_mode = ?, default_executor_id = ?
         WHERE id = ?`,
      )
      .run(
        label,
        rolePath,
        overlay,
        schedule,
        review,
        patch.defaultExecutorId !== undefined
          ? patch.defaultExecutorId
          : cur.default_executor_id,
        id,
      )
    return this.getProfile(id)!
  }

  deleteProfile(id: string) {
    const cur = this.getProfile(id)
    if (!cur) throw new Error(`profile not found: ${id}`)
    const used = this.deps.db
      .prepare(`SELECT COUNT(*) AS c FROM assignments WHERE profile_id = ?`)
      .get(id) as { c: number }
    if (used.c > 0) {
      throw new Error(`profile ${id} still used by ${used.c} assignment(s) — reassign or delete them first`)
    }
    this.deps.db.prepare(`DELETE FROM profiles WHERE id = ?`).run(id)
    return { ok: true as const, id }
  }

  listRoleFiles(): string[] {
    const pack = this.lawpackRoot(this.settings())
    const dir = join(pack, 'roles')
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .map((f) => `roles/${f}`)
      .sort()
  }

  listOverlayFiles(): string[] {
    const pack = this.lawpackRoot(this.settings())
    const dir = join(pack, 'profiles')
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''))
      .sort()
  }

  private assertScheduleMode(mode: string) {
    if (!['manual', 'once', 'infinite', 'cron', 'on_event'].includes(mode)) {
      throw new Error(`invalid scheduleMode=${mode}`)
    }
  }

  private assertReviewMode(mode: string) {
    if (!['human', 'llm_propose', 'llm_auto'].includes(mode)) {
      throw new Error(`invalid reviewMode=${mode}`)
    }
  }

  sniff(projectId: string): Project {
    const p = this.requireProject(projectId)
    const root = p.localPath
    const meta: Record<string, unknown> = {
      sniffedAt: new Date().toISOString(),
      hasPackageJson: existsSync(join(root, 'package.json')),
      hasCi: existsSync(join(root, '.github', 'workflows')),
      suggestedProfileId: this.settings().defaultProfileId,
      gateCommand: existsSync(join(root, 'package.json')) ? 'pnpm gate' : null,
    }
    if (meta.hasPackageJson) {
      try {
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
          packageManager?: string
          scripts?: Record<string, string>
        }
        meta.packageManager = pkg.packageManager?.split('@')[0] ?? 'npm'
        if (pkg.scripts?.gate) meta.gateCommand = 'pnpm gate'
        else if (pkg.scripts?.test) meta.gateCommand = 'pnpm test'
      } catch {
        /* keep */
      }
    }
    const next = {
      ...p,
      meta: { ...p.meta, ...meta },
      updatedAt: new Date().toISOString(),
    }
    return this.deps.projects.update(next)
  }

  initPreview(projectId: string, body: Record<string, unknown>) {
    const s = this.settings()
    const preset = String(body.presetId ?? s.defaultPresetId) as
      | 'clean'
      | 'tracking'
      | 'offline'
    const injectionMode =
      (body.injectionMode as AgentKernelSettings['injectionMode'] | undefined) ??
      (preset === 'offline' ? 'repo_plant' : 'harness_inject')
    const injectStrength =
      (body.injectStrength as AgentKernelSettings['injectStrength'] | undefined) ??
      (preset === 'clean' ? 'strict' : 'hybrid')
    const createTracking =
      body.createTrackingFiles !== undefined
        ? Boolean(body.createTrackingFiles)
        : preset !== 'clean'
    return {
      projectId,
      presetId: preset,
      injectionMode,
      injectStrength,
      createTrackingFiles: createTracking,
      createAgentsMd: body.createAgentsMd !== undefined ? Boolean(body.createAgentsMd) : true,
      profileId: String(body.profileId ?? s.defaultProfileId),
      scheduleMode: String(body.scheduleMode ?? s.defaultScheduleMode),
      reviewMode: String(body.reviewMode ?? s.defaultReviewMode),
      lawpackPin: this.readLawpackVersion(),
      plannedFiles: this.planInitFiles(injectionMode, injectStrength, createTracking),
    }
  }

  initApply(projectId: string, body: Record<string, unknown>): Project {
    const plan = this.initPreview(projectId, body)
    const p = this.requireProject(projectId)
    const s = this.settings()
    const work = p.localPath

    if (plan.injectionMode === 'repo_plant') {
      this.plantLawpack(work, s)
    }
    if (plan.createTrackingFiles && plan.injectStrength !== 'strict') {
      this.ensureFile(
        join(work, s.layoutPaths.progress ?? 'PROGRESS.md'),
        `# PROGRESS\n\n## NOW\n\n- RUN_ID: (set on first assignment)\n- phase: initialized\n`,
      )
      this.ensureFile(
        join(work, s.layoutPaths.bugs ?? 'BUGS.md'),
        `# BUGS\n\n## Open\n\n## Fixed\n`,
      )
      this.ensureFile(
        join(work, s.layoutPaths.adapter ?? 'ADAPTER.md'),
        `# ADAPTER\n\ngate: ${(p.meta.gateCommand as string) ?? 'pnpm test'}\n`,
      )
    }
    if (plan.createAgentsMd) {
      const agents = join(work, s.layoutPaths.agentsMd ?? 'AGENTS.md')
      if (plan.injectionMode === 'repo_plant') {
        this.ensureFile(
          agents,
          `# AGENTS\n\nObey vendor/lawpack/LAWS.md (or planted lawpack). RUN_ID from PROGRESS.\n`,
        )
      } else {
        this.ensureFile(
          agents,
          `# AGENTS\n\nLaws arrive via agent-kernel harness_inject for this project. Obey Session Brief / ephemeral lawpack.\n`,
        )
      }
    }

    if (s.installProtectHooks && s.gitPolicyEnabled) {
      // only when both flags on — still requires pack scripts; no silent install if pack lacks feature
      const pack = this.lawpackRoot(s)
      const manifestPath = join(pack, 'MANIFEST.json')
      if (!existsSync(manifestPath)) {
        throw new Error('installProtectHooks set but lawpack MANIFEST.json missing')
      }
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        features?: string[]
      }
      if (!manifest.features?.includes('protect_scripts')) {
        throw new Error('installProtectHooks set but pack features omit protect_scripts')
      }
      // Hook install left to explicit future path — refuse silent partial install
      throw new Error(
        'installProtectHooks=true requires explicit hook installer (not silent). Disable flag or wait for hook installer implementation.',
      )
    }

    const assignmentId = randomUUID()
    const now = new Date().toISOString()
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'proj'
    const runId = runIdFromPattern(s.runIdPattern, slug)
    this.deps.db
      .prepare(
        `INSERT INTO assignments
         (id, owner_id, project_id, profile_id, schedule_mode, cron_expr, review_mode, run_id, paused, executor_id, fan_out_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)`,
      )
      .run(
        assignmentId,
        p.ownerId,
        p.id,
        plan.profileId,
        plan.scheduleMode,
        s.defaultCronExpr,
        plan.reviewMode,
        runId,
        s.executorId,
        now,
        now,
      )

    return this.deps.projects.update({
      ...p,
      status: 'initialized',
      lawpackVersion: plan.lawpackPin,
      meta: {
        ...p.meta,
        injectionMode: plan.injectionMode,
        injectStrength: plan.injectStrength,
        presetId: plan.presetId,
        initAssignmentId: assignmentId,
      },
      updatedAt: now,
    })
  }

  private planInitFiles(
    mode: string,
    strength: string,
    tracking: boolean,
  ): string[] {
    const files: string[] = []
    if (mode === 'repo_plant') files.push('vendor/lawpack/**', 'AGENTS.md')
    if (tracking && strength !== 'strict') {
      files.push('PROGRESS.md', 'BUGS.md', 'ADAPTER.md')
    }
    if (mode === 'harness_inject') files.push('AGENTS.md (thin)', 'pin in DB')
    return files
  }

  private readLawpackVersion(): string {
    const root = this.lawpackRoot(this.settings())
    const man = join(root, 'MANIFEST.json')
    if (!existsSync(man)) throw new Error(`Lawpack MANIFEST missing at ${man}`)
    const j = JSON.parse(readFileSync(man, 'utf8')) as { version?: string; id?: string }
    return `${j.id ?? 'lawpack'}@${j.version ?? 'unknown'}`
  }

  private plantLawpack(work: string, s: AgentKernelSettings): void {
    const src = this.lawpackRoot(s)
    const dest = join(work, 'vendor', 'lawpack')
    mkdirSync(dest, { recursive: true })
    // shallow copy essential files
    for (const rel of ['MANIFEST.json', 'LAWS.md', 'OWNED_PATHS.md', 'RUNTIME.md']) {
      const from = join(src, rel)
      if (existsSync(from)) writeFileSync(join(dest, rel), readFileSync(from))
    }
    this.copyDir(join(src, 'roles'), join(dest, 'roles'))
    writeFileSync(join(dest, 'LAWPACK_VERSION'), this.readLawpackVersion())
  }

  private copyDir(from: string, to: string): void {
    if (!existsSync(from)) return
    mkdirSync(to, { recursive: true })
    for (const name of readdirSync(from)) {
      const a = join(from, name)
      const b = join(to, name)
      if (statSync(a).isDirectory()) this.copyDir(a, b)
      else writeFileSync(b, readFileSync(a))
    }
  }

  private ensureFile(path: string, content: string): void {
    if (existsSync(path)) return
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }

  requireProject(id: string): Project {
    const p = this.deps.projects.getById(id)
    if (!p) throw new Error(`project not found: ${id}`)
    return p
  }

  listAssignments(projectId: string | null) {
    if (projectId) {
      return this.deps.db
        .prepare(`SELECT * FROM assignments WHERE project_id = ? ORDER BY created_at DESC`)
        .all(projectId)
    }
    return this.deps.db
      .prepare(`SELECT * FROM assignments WHERE project_id IS NULL ORDER BY created_at DESC`)
      .all()
  }

  getAssignment(id: string) {
    return this.deps.db.prepare(`SELECT * FROM assignments WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined
  }

  createAssignment(input: {
    projectId: string | null
    profileId: string
    scheduleMode: string
    reviewMode: string
    runId?: string | null
    executorId?: string | null
    cronExpr?: string | null
    fanOut?: unknown
    ownerId: string
  }) {
    if (input.projectId === null && !input.fanOut) {
      throw new Error('global assignment requires fanOut selector')
    }
    if (!this.getProfile(input.profileId)) {
      throw new Error(`profile not found: ${input.profileId}`)
    }
    this.assertScheduleMode(input.scheduleMode)
    this.assertReviewMode(input.reviewMode)
    if (input.scheduleMode === 'cron' && !String(input.cronExpr ?? '').trim()) {
      throw new Error('cron scheduleMode requires cronExpr')
    }
    if (input.projectId) this.requireProject(input.projectId)
    const id = randomUUID()
    const now = new Date().toISOString()
    const s = this.settings()
    this.deps.db
      .prepare(
        `INSERT INTO assignments
         (id, owner_id, project_id, profile_id, schedule_mode, cron_expr, review_mode, run_id, paused, executor_id, fan_out_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.ownerId,
        input.projectId,
        input.profileId,
        input.scheduleMode,
        input.scheduleMode === 'cron'
          ? (input.cronExpr ?? s.defaultCronExpr)
          : (input.cronExpr ?? null),
        input.reviewMode,
        input.runId ?? null,
        input.executorId ?? s.executorId,
        input.fanOut ? JSON.stringify(input.fanOut) : null,
        now,
        now,
      )
    return this.getAssignment(id)
  }

  patchAssignment(
    id: string,
    patch: {
      paused?: boolean
      cronExpr?: string | null
      scheduleMode?: string
      reviewMode?: string
      profileId?: string
      fanOut?: unknown
      runId?: string | null
      executorId?: string | null
    },
  ) {
    const cur = this.getAssignment(id)
    if (!cur) throw new Error(`assignment not found: ${id}`)
    if (patch.profileId && !this.getProfile(patch.profileId)) {
      throw new Error(`profile not found: ${patch.profileId}`)
    }
    const scheduleMode = patch.scheduleMode ?? String(cur.schedule_mode)
    const reviewMode = patch.reviewMode ?? String(cur.review_mode)
    this.assertScheduleMode(scheduleMode)
    this.assertReviewMode(reviewMode)
    const cronExpr =
      patch.cronExpr !== undefined ? patch.cronExpr : (cur.cron_expr as string | null)
    if (scheduleMode === 'cron' && !String(cronExpr ?? '').trim()) {
      throw new Error('cron scheduleMode requires cronExpr')
    }
    if (cur.project_id === null) {
      const fanOut =
        patch.fanOut !== undefined
          ? patch.fanOut
          : cur.fan_out_json
            ? JSON.parse(String(cur.fan_out_json))
            : null
      if (!fanOut) throw new Error('global assignment requires fanOut selector')
    }
    const now = new Date().toISOString()
    this.deps.db
      .prepare(
        `UPDATE assignments SET
           paused = ?,
           cron_expr = ?,
           schedule_mode = ?,
           review_mode = ?,
           profile_id = ?,
           fan_out_json = ?,
           run_id = ?,
           executor_id = ?,
           updated_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.paused !== undefined ? (patch.paused ? 1 : 0) : cur.paused,
        cronExpr,
        scheduleMode,
        reviewMode,
        patch.profileId ?? cur.profile_id,
        patch.fanOut !== undefined
          ? JSON.stringify(patch.fanOut)
          : cur.fan_out_json,
        patch.runId !== undefined ? patch.runId : cur.run_id,
        patch.executorId !== undefined ? patch.executorId : cur.executor_id,
        now,
        id,
      )
    return this.getAssignment(id)
  }

  deleteAssignment(id: string) {
    const cur = this.getAssignment(id)
    if (!cur) throw new Error(`assignment not found: ${id}`)
    this.deps.db.prepare(`DELETE FROM assignments WHERE id = ?`).run(id)
    return { ok: true as const, id }
  }

  resolveFanOutTargets(assignmentId: string): { projectIds: string[]; skipped: { id: string; reason: string }[] } {
    const a = this.getAssignment(assignmentId)
    if (!a) throw new Error(`assignment not found: ${assignmentId}`)
    if (a.project_id) {
      return { projectIds: [String(a.project_id)], skipped: [] }
    }
    const raw = a.fan_out_json
    if (!raw) throw new Error('global assignment missing fan_out_json')
    const sel = (typeof raw === 'string' ? JSON.parse(raw) : raw) as FanOutSelector
    const all = this.deps.projects.listByOwner(String(a.owner_id))
    let candidates = all
    if (sel.mode === 'all_initialized') {
      candidates = all.filter((p) => p.status === 'initialized')
    } else if (sel.mode === 'tag') {
      const tags = new Set(sel.tags ?? [])
      candidates = all.filter((p) => {
        const userTags = (p.meta.userTags as string[] | undefined) ?? []
        return userTags.some((t) => tags.has(t))
      })
    } else if (sel.mode === 'allow_list') {
      const allow = new Set(sel.projectIds ?? [])
      candidates = all.filter((p) => allow.has(p.id))
    } else {
      throw new Error(`unknown fanOut.mode: ${(sel as FanOutSelector).mode}`)
    }
    const exclude = new Set(sel.excludeProjectIds ?? [])
    const skipped: { id: string; reason: string }[] = []
    const projectIds: string[] = []
    for (const p of candidates) {
      if (exclude.has(p.id)) {
        skipped.push({ id: p.id, reason: 'deny_list' })
        continue
      }
      if (!sel.force && p.status !== 'initialized') {
        skipped.push({ id: p.id, reason: 'uninitialized' })
        continue
      }
      if (!existsSync(p.localPath)) {
        skipped.push({ id: p.id, reason: 'path_missing' })
        continue
      }
      projectIds.push(p.id)
    }
    return { projectIds, skipped }
  }

  buildBrief(assignmentId: string, projectIdOverride?: string): SessionBrief {
    const a = this.getAssignment(assignmentId)
    if (!a) throw new Error(`assignment not found: ${assignmentId}`)
    const projectId = projectIdOverride ?? (a.project_id as string | null)
    if (!projectId) {
      throw new Error('brief requires projectId (use fan-out targets for global assignments)')
    }
    const p = this.requireProject(projectId)
    const profile = this.deps.db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(a.profile_id) as
      | Record<string, unknown>
      | undefined
    if (!profile) throw new Error(`profile not found: ${a.profile_id}`)
    const s = this.settings()
    const pack = this.lawpackRoot(s)
    const rolePath = String(profile.role_path)
    const roleAbs = join(pack, rolePath)
    if (!existsSync(roleAbs)) throw new Error(`role file missing: ${roleAbs}`)
    let roleText = readFileSync(roleAbs, 'utf8')
    const overlay = profile.lawpack_profile_overlay
      ? join(pack, 'profiles', `${profile.lawpack_profile_overlay}.md`)
      : null
    if (overlay && existsSync(overlay)) {
      roleText = `${roleText}\n\n---\n# Overlay\n\n${readFileSync(overlay, 'utf8')}`
    }
    const injectionMode =
      (p.meta.injectionMode as SessionBrief['injectionMode']) ?? s.injectionMode
    const runId =
      (a.run_id as string | null) ??
      runIdFromPattern(
        s.runIdPattern,
        p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'proj',
      )

    let executorCwd: string | null = null
    if (
      s.dshWorkdirHostPrefix &&
      s.dshWorkdirContainerPrefix &&
      p.localPath.startsWith(s.dshWorkdirHostPrefix)
    ) {
      executorCwd =
        s.dshWorkdirContainerPrefix + p.localPath.slice(s.dshWorkdirHostPrefix.length)
    }

    return {
      projectId: p.id,
      assignmentId: String(a.id),
      executorId: String(a.executor_id ?? s.executorId),
      workdir: p.localPath,
      executorCwd,
      runId,
      lawpackPin: p.lawpackVersion,
      injectionMode,
      rolesPath: rolePath,
      agentsMdPath: s.layoutPaths.agentsMd ?? 'AGENTS.md',
      gateCommand: (p.meta.gateCommand as string) ?? null,
      ownedPathsRef: s.ownedPathsFile,
      profileId: String(profile.id),
      reviewMode: String(a.review_mode) as SessionBrief['reviewMode'],
      initialObjective: null,
      injectMaterialization:
        injectionMode === 'harness_inject'
          ? s.injectStrength === 'strict'
            ? 'prompt_inline'
            : 'dot_agent'
          : 'none',
      rolePromptText: roleText,
    }
  }

  /** BYO only — never falls back to global Settings DSH. */
  private resolveExecutorConfig(ownerId: string): {
    executorId: string
    dshInvokeMode: 'cli' | 'host_http'
    dshEndpoint: string | null
    dshTrustedHost: string | null
    dshBasicAuthUser: string | null
    dshBasicAuthPassword: string | null
    dshCliRoot: string | null
    dshHome: string | null
  } {
    if (!ownerId || !this.getUser(ownerId)) {
      throw new Error('executor requires authenticated kernel user')
    }
    const ue = this.getUserExecutorSettings(ownerId)
    const gaps = userExecutorSetupGaps(ue)
    if (gaps.length) {
      throw new Error(
        `My Executor incomplete: ${gaps.join(', ')}. Set your DSH/PIDEA endpoint under My Executor — no shared global executor.`,
      )
    }
    return ue
  }

  private executor(ownerId: string): ExecutorPort {
    return createExecutor(this.resolveExecutorConfig(ownerId))
  }

  async pingDsh(ownerId: string): Promise<void> {
    const s = this.resolveExecutorConfig(ownerId)
    if (s.executorId !== 'dsh') {
      throw new Error(`test-dsh only applies to executorId=dsh (got ${s.executorId})`)
    }
    if (s.dshInvokeMode === 'cli') {
      const has =
        existsSync(join(s.dshCliRoot!, 'apps/cli/src/bin.ts')) ||
        existsSync(join(s.dshCliRoot!, 'apps/cli/lib/bin.js'))
      if (!has) throw new Error(`DSH CLI missing under ${s.dshCliRoot}`)
      return
    }
    const client = new DshHostClient({
      endpoint: s.dshEndpoint!,
      trustedHost: s.dshTrustedHost!,
      basicAuthUser: s.dshBasicAuthUser,
      basicAuthPassword: s.dshBasicAuthPassword,
    })
    await client.ping()
  }

  materializeInject(brief: SessionBrief): void {
    const s = this.settings()
    if (brief.injectionMode !== 'harness_inject') return
    if (brief.injectMaterialization === 'dot_agent' && brief.rolePromptText) {
      const dir = join(brief.workdir, s.layoutPaths.lawpackDir ?? '.agent/lawpack')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'INJECTED_ROLE.md'), brief.rolePromptText)
      const gi = join(brief.workdir, '.gitignore')
      const line = '.agent/'
      if (existsSync(gi)) {
        const cur = readFileSync(gi, 'utf8')
        if (!cur.includes(line)) writeFileSync(gi, `${cur.trimEnd()}\n${line}\n`)
      } else {
        writeFileSync(gi, `${line}\n`)
      }
    }
  }

  private policyCheck(brief: SessionBrief): void {
    const s = this.settings()
    const p = this.requireProject(brief.projectId)
    const decision = authorizeSessionStart({
      brief,
      projectStatus: p.status,
      projectPathExists: existsSync(p.localPath),
      projectLocalPath: p.localPath,
      settings: s,
    })
    assertPolicyAllowed(decision)
  }

  /** Optional GateWay text for llm_propose — fails loudly if mode needs it and gateway missing? No: propose = human gate; gateway enriches when configured. */
  private async maybeAttachReviewProposal(
    ownerId: string,
    brief: SessionBrief,
  ): Promise<SessionBrief & { reviewProposal?: string }> {
    if (brief.reviewMode !== 'llm_propose') return brief
    const ue = this.getUserExecutorSettings(ownerId)
    const gatewayUrl = ue.gatewayUrl?.trim() || this.settings().gatewayUrl?.trim()
    const gatewayKey =
      ue.gatewayApiKey?.trim() ||
      this.settings().gatewayApiKey?.trim() ||
      (this.settings().gatewayApiKeyRef
        ? process.env[this.settings().gatewayApiKeyRef!]
        : undefined)
    if (!gatewayUrl || !gatewayKey) {
      return {
        ...brief,
        reviewProposal:
          '(no GateWay configured — human must approve from Brief alone; set My Executor gatewayUrl to attach an LLM proposal)',
      }
    }
    const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${gatewayKey}`,
      },
      body: JSON.stringify({
        model: 'default',
        messages: [
          {
            role: 'system',
            content:
              'You review agent-kernel SessionBriefs. Reply with a short approve/deny recommendation and risks (max 12 lines).',
          },
          {
            role: 'user',
            content: JSON.stringify({
              projectId: brief.projectId,
              profileId: brief.profileId,
              runId: brief.runId,
              workdir: brief.workdir,
              objective: brief.initialObjective,
              roleExcerpt: (brief.rolePromptText ?? '').slice(0, 2000),
            }),
          },
        ],
        temperature: 0.2,
      }),
    })
    if (!res.ok) {
      throw new Error(`GateWay review proposal failed HTTP ${res.status}: ${await res.text()}`)
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = json.choices?.[0]?.message?.content?.trim()
    if (!text) throw new Error('GateWay review proposal returned empty content')
    return { ...brief, reviewProposal: text }
  }

  private async nudgeOne(
    assignmentId: string,
    projectId: string,
    ownerId: string,
    promptText?: string,
  ): Promise<unknown> {
    const brief = this.buildBrief(assignmentId, projectId)
    this.policyCheck(brief)

    // llm_propose: queue brief for human approve — do not touch executor yet.
    if (brief.reviewMode === 'llm_propose') {
      const withProposal = await this.maybeAttachReviewProposal(ownerId, brief)
      const id = randomUUID()
      const briefJson = JSON.stringify({
        ...withProposal,
        pendingPrompt: promptText ?? null,
      })
      const hash = createHash('sha256').update(briefJson).digest('hex').slice(0, 16)
      this.deps.db
        .prepare(
          `INSERT INTO runs
           (id, assignment_id, project_id, executor_id, executor_session_id, started_at, ended_at, outcome, brief_json, brief_hash, deny_reason)
           VALUES (?, ?, ?, ?, NULL, ?, NULL, 'awaiting_review', ?, ?, NULL)`,
        )
        .run(
          id,
          brief.assignmentId,
          brief.projectId,
          brief.executorId,
          new Date().toISOString(),
          briefJson,
          hash,
        )
      return this.deps.db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id)
    }

    // human + llm_auto: start executor immediately (llm_auto = no human gate).
    return this.startExecutorRun(brief, ownerId, promptText)
  }

  private async startExecutorRun(
    brief: SessionBrief,
    ownerId: string,
    promptText?: string | null,
    existingRunId?: string,
  ): Promise<unknown> {
    this.materializeInject(brief)
    const ex = this.executor(ownerId)
    const s = this.resolveExecutorConfig(ownerId)

    let executorSessionId: string
    const last = this.deps.db
      .prepare(
        `SELECT executor_session_id FROM runs
         WHERE assignment_id = ? AND project_id = ? AND outcome = 'running'
         ORDER BY started_at DESC LIMIT 1`,
      )
      .get(brief.assignmentId, brief.projectId) as { executor_session_id: string } | undefined

    if (s.dshInvokeMode === 'host_http' && last?.executor_session_id && promptText?.trim()) {
      await ex.nudge(brief, last.executor_session_id, promptText)
      executorSessionId = last.executor_session_id
    } else {
      const started = await ex.start(brief)
      executorSessionId = started.executorSessionId
      if (promptText?.trim() && s.dshInvokeMode === 'host_http') {
        await ex.nudge(brief, executorSessionId, promptText)
      }
    }

    const briefJson = JSON.stringify(brief)
    const hash = createHash('sha256').update(briefJson).digest('hex').slice(0, 16)
    const outcome = s.dshInvokeMode === 'cli' ? 'completed' : 'running'
    const now = new Date().toISOString()

    if (existingRunId) {
      this.deps.db
        .prepare(
          `UPDATE runs SET executor_session_id = ?, outcome = ?, ended_at = ?, brief_json = ?, brief_hash = ?, deny_reason = NULL
           WHERE id = ?`,
        )
        .run(
          executorSessionId,
          outcome,
          outcome === 'completed' ? now : null,
          briefJson,
          hash,
          existingRunId,
        )
      return this.deps.db.prepare(`SELECT * FROM runs WHERE id = ?`).get(existingRunId)
    }

    const id = randomUUID()
    this.deps.db
      .prepare(
        `INSERT INTO runs
         (id, assignment_id, project_id, executor_id, executor_session_id, started_at, ended_at, outcome, brief_json, brief_hash, deny_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        id,
        brief.assignmentId,
        brief.projectId,
        brief.executorId,
        executorSessionId,
        now,
        outcome === 'completed' ? now : null,
        outcome,
        briefJson,
        hash,
      )
    return this.deps.db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id)
  }

  /** Approve an llm_propose run — only then ExecutorPort.start. */
  async approveRun(ownerId: string, runId: string) {
    const run = this.getRun(runId) as Record<string, unknown> | undefined
    if (!run) throw new Error(`run not found: ${runId}`)
    if (String(run.outcome) !== 'awaiting_review') {
      throw new Error(`run ${runId} is not awaiting_review (got ${run.outcome})`)
    }
    if (!run.brief_json) throw new Error(`run ${runId} missing brief_json`)
    const parsed = JSON.parse(String(run.brief_json)) as SessionBrief & {
      pendingPrompt?: string | null
    }
    const { pendingPrompt, ...brief } = parsed
    this.policyCheck(brief)
    const gaps = this.setupGapsForUser(ownerId)
    if (gaps.length) {
      throw new Error(`Setup incomplete: ${gaps.join(', ')}. Finish setup / My Executor.`)
    }
    return this.startExecutorRun(brief, ownerId, pendingPrompt ?? undefined, String(run.id))
  }

  rejectRun(runId: string, reason?: string) {
    const run = this.getRun(runId) as Record<string, unknown> | undefined
    if (!run) throw new Error(`run not found: ${runId}`)
    if (String(run.outcome) !== 'awaiting_review') {
      throw new Error(`run ${runId} is not awaiting_review`)
    }
    const now = new Date().toISOString()
    this.deps.db
      .prepare(
        `UPDATE runs SET outcome = 'rejected', ended_at = ?, deny_reason = ? WHERE id = ?`,
      )
      .run(now, reason?.trim() || 'rejected by operator', runId)
    return this.getRun(runId)
  }

  async nudge(assignmentId: string, promptText?: string) {
    const a = this.getAssignment(assignmentId)
    if (!a) throw new Error(`assignment not found: ${assignmentId}`)
    const ownerId = String(a.owner_id)
    const gaps = this.setupGapsForUser(ownerId)
    if (gaps.length) {
      throw new Error(`Setup incomplete: ${gaps.join(', ')}. Finish setup / My Executor.`)
    }
    if (a.paused) throw new Error('assignment is paused')
    const { projectIds } = this.resolveFanOutTargets(assignmentId)
    if (!projectIds.length) throw new Error('fan-out resolved zero projects')
    const runs = []
    for (const pid of projectIds) {
      runs.push(await this.nudgeOne(assignmentId, pid, ownerId, promptText))
    }
    return projectIds.length === 1 ? runs[0] : { runs, count: runs.length }
  }

  /** Scheduler — cron due + infinite idle re-nudge + once never-run. */
  async schedulerTick(now = new Date()): Promise<{ fired: string[]; errors: string[] }> {
    const fired: string[] = []
    const errors: string[] = []
    const minuteKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`

    const cronRows = this.deps.db
      .prepare(
        `SELECT * FROM assignments WHERE paused = 0 AND schedule_mode = 'cron' AND cron_expr IS NOT NULL`,
      )
      .all() as Record<string, unknown>[]
    for (const a of cronRows) {
      try {
        if (!cronMatches(String(a.cron_expr), now)) continue
        if (!(await this.tryFireAssignment(String(a.id), minuteKey, `Scheduled cron tick ${now.toISOString()}`))) {
          continue
        }
        fired.push(String(a.id))
      } catch (e) {
        errors.push(`${a.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    const infiniteRows = this.deps.db
      .prepare(`SELECT * FROM assignments WHERE paused = 0 AND schedule_mode = 'infinite'`)
      .all() as Record<string, unknown>[]
    for (const a of infiniteRows) {
      try {
        if (this.assignmentHasRunningRun(String(a.id))) continue
        if (!(await this.tryFireAssignment(String(a.id), minuteKey, `Infinite schedule tick ${now.toISOString()}`))) {
          continue
        }
        fired.push(String(a.id))
      } catch (e) {
        errors.push(`${a.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    const onceRows = this.deps.db
      .prepare(`SELECT * FROM assignments WHERE paused = 0 AND schedule_mode = 'once'`)
      .all() as Record<string, unknown>[]
    for (const a of onceRows) {
      try {
        const anyRun = this.deps.db
          .prepare(`SELECT id FROM runs WHERE assignment_id = ? LIMIT 1`)
          .get(a.id) as { id: string } | undefined
        if (anyRun) continue
        if (!(await this.tryFireAssignment(String(a.id), minuteKey, `Once schedule fire ${now.toISOString()}`))) {
          continue
        }
        fired.push(String(a.id))
      } catch (e) {
        errors.push(`${a.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return { fired, errors }
  }

  private assignmentHasRunningRun(assignmentId: string): boolean {
    const row = this.deps.db
      .prepare(
        `SELECT id FROM runs WHERE assignment_id = ? AND outcome = 'running' LIMIT 1`,
      )
      .get(assignmentId) as { id: string } | undefined
    return Boolean(row)
  }

  private async tryFireAssignment(
    assignmentId: string,
    minuteKey: string,
    prompt: string,
  ): Promise<boolean> {
    const metaKey = `sched_fire:${assignmentId}`
    const last = this.deps.db.prepare(`SELECT value FROM kv WHERE key = ?`).get(metaKey) as
      | { value: string }
      | undefined
    if (last?.value === minuteKey) return false
    this.deps.db
      .prepare(
        `INSERT INTO kv (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(metaKey, minuteKey)
    await this.nudge(assignmentId, prompt)
    return true
  }

  analyze(projectId: string) {
    const p = this.sniff(projectId)
    const root = p.localPath
    const facts: Record<string, unknown> = {
      ...(p.meta as Record<string, unknown>),
      analyzedAt: new Date().toISOString(),
      hygiene: {
        hasReadme: existsSync(join(root, 'README.md')),
        hasLicense: existsSync(join(root, 'LICENSE')) || existsSync(join(root, 'LICENSE.md')),
        hasLockfile:
          existsSync(join(root, 'pnpm-lock.yaml')) ||
          existsSync(join(root, 'package-lock.json')) ||
          existsSync(join(root, 'yarn.lock')),
        hasTests:
          existsSync(join(root, 'test')) ||
          existsSync(join(root, 'tests')) ||
          existsSync(join(root, '__tests__')),
        hasProgress: existsSync(join(root, 'PROGRESS.md')),
        hasBugs: existsSync(join(root, 'BUGS.md')),
        hasAdapter: existsSync(join(root, 'ADAPTER.md')),
      },
      autonomyReady: p.status === 'initialized',
      lawpackPin: p.lawpackVersion,
    }
    try {
      const last = execSync('git log -1 --format=%cI', { cwd: root, encoding: 'utf8' }).trim()
      facts.lastCommitAt = last
      const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
      facts.daysSinceTouch = days
    } catch {
      facts.git = 'unavailable'
    }
    let fileCount = 0
    const walk = (dir: string, depth: number) => {
      if (depth > 4 || fileCount > 5000) return
      let entries: string[]
      try {
        entries = readdirSync(dir)
      } catch {
        return
      }
      for (const name of entries) {
        if (name === 'node_modules' || name === '.git' || name === 'dist') continue
        const full = join(dir, name)
        try {
          const st = statSync(full)
          if (st.isDirectory()) walk(full, depth + 1)
          else fileCount++
        } catch {
          /* skip */
        }
      }
    }
    walk(root, 0)
    facts.fileCountApprox = fileCount
    const advice: string[] = []
    if (!facts.hygiene || !(facts.hygiene as { hasReadme: boolean }).hasReadme) {
      advice.push('Add README.md')
    }
    if (p.status !== 'initialized') advice.push('Run Init')
    if ((facts.daysSinceTouch as number | undefined) !== undefined && (facts.daysSinceTouch as number) > 90) {
      advice.push('Stale repo — consider agent follow-up or archive tag')
    }
    const next = {
      ...p,
      meta: { ...p.meta, facts, advice, factsAt: facts.analyzedAt },
      updatedAt: new Date().toISOString(),
    }
    return this.deps.projects.update(next)
  }

  listRuns(projectId?: string) {
    if (projectId) {
      return this.deps.db
        .prepare(`SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC`)
        .all(projectId)
    }
    return this.deps.db.prepare(`SELECT * FROM runs ORDER BY started_at DESC LIMIT 100`).all()
  }

  getRun(id: string) {
    return this.deps.db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id)
  }

  /**
   * Live executor transcript for a run via ExecutorPort.getTranscript.
   * Fails loudly if session id or executor cannot serve history.
   */
  async getRunTranscript(ownerId: string, runId: string) {
    const run = this.getRun(runId) as
      | {
          id: string
          assignment_id: string
          project_id: string
          executor_session_id: string | null
          outcome: string | null
          started_at: string
          ended_at: string | null
        }
      | undefined
    if (!run) throw new Error(`run not found: ${runId}`)
    const sessionId = run.executor_session_id?.trim()
    if (!sessionId) {
      throw new Error(`run ${runId} has no executor_session_id — cannot load transcript`)
    }

    const ex = this.executor(ownerId)
    const transcript = await ex.getTranscript(sessionId)

    if (transcript.session.running && run.outcome !== 'running') {
      this.deps.db
        .prepare(`UPDATE runs SET outcome = 'running', ended_at = NULL WHERE id = ?`)
        .run(runId)
    } else if (!transcript.session.running && run.outcome === 'running') {
      this.deps.db
        .prepare(`UPDATE runs SET outcome = 'completed', ended_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), runId)
    }

    return {
      run: this.getRun(runId),
      session: transcript.session,
      historyPages: transcript.meta.historyPages,
      eventCount: transcript.meta.eventCount,
      messages: transcript.messages,
      fileOps: transcript.fileOps,
      rawEvents: transcript.rawEvents,
      executorId: ex.id,
    }
  }

  /** Cross-repo agent board: assignments + latest run + project/profile labels. */
  agentActivity(ownerId: string) {
    const assignments = this.deps.db
      .prepare(
        `SELECT * FROM assignments WHERE owner_id = ? ORDER BY updated_at DESC`,
      )
      .all(ownerId) as Record<string, unknown>[]
    const profiles = new Map(
      (this.listProfiles() as { id: string; label: string; role_path: string }[]).map((p) => [
        p.id,
        p,
      ]),
    )
    const projects = new Map(this.deps.projects.listByOwner(ownerId).map((p) => [p.id, p]))

    return {
      items: assignments.map((a) => {
        const projectId = a.project_id ? String(a.project_id) : null
        const project = projectId ? projects.get(projectId) : undefined
        const profile = profiles.get(String(a.profile_id))
        const latest = this.deps.db
          .prepare(
            `SELECT id, outcome, started_at, ended_at, executor_session_id, brief_hash
             FROM runs WHERE assignment_id = ? ORDER BY started_at DESC LIMIT 1`,
          )
          .get(String(a.id)) as
          | {
              id: string
              outcome: string | null
              started_at: string
              ended_at: string | null
              executor_session_id: string | null
              brief_hash: string | null
            }
          | undefined
        const status = a.paused
          ? 'paused'
          : latest?.outcome === 'running'
            ? 'running'
            : latest
              ? String(latest.outcome ?? 'idle')
              : 'idle'
        return {
          assignmentId: String(a.id),
          projectId,
          projectName: project?.name ?? (projectId ? '(missing project)' : 'fan-out / global'),
          projectPath: project?.localPath ?? null,
          profileId: String(a.profile_id),
          profileLabel: profile?.label ?? String(a.profile_id),
          scheduleMode: String(a.schedule_mode),
          cronExpr: a.cron_expr ? String(a.cron_expr) : null,
          reviewMode: String(a.review_mode),
          paused: Boolean(a.paused),
          status,
          latestRun: latest
            ? {
                id: latest.id,
                outcome: latest.outcome,
                startedAt: latest.started_at,
                endedAt: latest.ended_at,
                executorSessionId: latest.executor_session_id,
                briefHash: latest.brief_hash,
              }
            : null,
        }
      }),
    }
  }

  attention(ownerId: string) {
    const projects = this.deps.projects.listByOwner(ownerId)
    const items: Array<Record<string, unknown>> = []
    for (const p of projects) {
      if (p.status !== 'initialized') {
        items.push({ kind: 'uninitialized', projectId: p.id, name: p.name })
      }
      if (!existsSync(p.localPath)) {
        items.push({ kind: 'path_missing', projectId: p.id, name: p.name, path: p.localPath })
      }
      const advice = (p.meta.advice as string[] | undefined) ?? []
      if (advice.length) {
        items.push({ kind: 'advice', projectId: p.id, name: p.name, advice })
      }
    }
    const awaiting = this.deps.db
      .prepare(
        `SELECT id, project_id, assignment_id, started_at FROM runs
         WHERE outcome = 'awaiting_review' ORDER BY started_at DESC LIMIT 50`,
      )
      .all() as Array<{ id: string; project_id: string; assignment_id: string; started_at: string }>
    for (const r of awaiting) {
      const proj = projects.find((p) => p.id === r.project_id)
      items.push({
        kind: 'awaiting_review',
        projectId: r.project_id,
        name: proj?.name ?? r.project_id,
        runId: r.id,
        assignmentId: r.assignment_id,
        startedAt: r.started_at,
      })
    }
    const stalled = this.deps.db
      .prepare(
        `SELECT a.id AS assignment_id, a.project_id, a.profile_id, a.updated_at
         FROM assignments a
         WHERE a.paused = 0 AND a.schedule_mode = 'infinite'
           AND NOT EXISTS (
             SELECT 1 FROM runs r
             WHERE r.assignment_id = a.id AND r.outcome = 'running'
           )`,
      )
      .all() as Array<{
      assignment_id: string
      project_id: string | null
      profile_id: string
      updated_at: string
    }>
    for (const a of stalled) {
      const proj = a.project_id ? projects.find((p) => p.id === a.project_id) : undefined
      items.push({
        kind: 'infinite_idle',
        projectId: a.project_id,
        name: proj?.name ?? 'fan-out / global',
        assignmentId: a.assignment_id,
        profileId: a.profile_id,
        updatedAt: a.updated_at,
      })
    }
    return { items }
  }

  private async dispatchTool(
    call: {
      tool: string
      projectId?: string
      assignmentId?: string
      text?: string
      name?: string
      path?: string
      fanOut?: unknown
      profileId?: string
      scheduleMode?: string
      reviewMode?: string
      cronExpr?: string
    },
    scope: { projectId?: string; ownerId: string },
  ): Promise<unknown> {
    switch (call.tool) {
      case 'list_projects':
        return this.listProjects(scope.ownerId)
      case 'get_attention':
        return this.attention(scope.ownerId)
      case 'list_assignments':
        return this.listAssignments(call.projectId ?? scope.projectId ?? null)
      case 'brief_preview':
        if (!call.assignmentId) throw new Error('assignmentId required')
        return this.buildBrief(call.assignmentId, call.projectId)
      case 'preview_fanout_targets':
        if (!call.assignmentId) throw new Error('assignmentId required')
        return this.resolveFanOutTargets(call.assignmentId)
      case 'nudge_run':
        if (!call.assignmentId) throw new Error('assignmentId required')
        return this.nudge(call.assignmentId, call.text)
      case 'analyze_project': {
        const pid = call.projectId ?? scope.projectId
        if (!pid) throw new Error('projectId required')
        return this.analyze(pid)
      }
      case 'create_assignment':
        return this.createAssignment({
          ownerId: scope.ownerId,
          projectId: call.projectId ?? scope.projectId ?? null,
          profileId: call.profileId ?? this.settings().defaultProfileId,
          scheduleMode: call.scheduleMode ?? 'manual',
          reviewMode: call.reviewMode ?? 'human',
          cronExpr: call.cronExpr ?? null,
          fanOut: call.fanOut,
        })
      default:
        throw new Error(`unknown tool: ${call.tool}`)
    }
  }

  async operatorChat(
    message: string,
    scope: { projectId?: string; ownerId: string },
  ): Promise<{
    reply: string
    toolResults: unknown[]
  }> {
    const gaps = this.setupGapsForUser(scope.ownerId)
    if (gaps.length) {
      throw new Error(`Setup incomplete: ${gaps.join(', ')}. Configure My Executor first.`)
    }
    const ue = this.getUserExecutorSettings(scope.ownerId)
    const gatewayUrl = ue.gatewayUrl?.trim() || this.settings().gatewayUrl?.trim()
    const gatewayKey =
      ue.gatewayApiKey?.trim() ||
      this.settings().gatewayApiKey?.trim() ||
      (this.settings().gatewayApiKeyRef
        ? process.env[this.settings().gatewayApiKeyRef!]
        : undefined)
    if (!gatewayUrl) {
      throw new Error('gatewayUrl required on My Executor (or global Settings) — no fake LLM')
    }
    if (!gatewayKey) {
      throw new Error('gatewayApiKey required on My Executor (or global Settings)')
    }
    const key = gatewayKey

    const tools = [
      {
        type: 'function',
        function: {
          name: 'list_projects',
          description: 'List catalog projects',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_attention',
          description: 'Attention / triage items',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_assignments',
          description: 'List assignments; omit projectId for global',
          parameters: {
            type: 'object',
            properties: { projectId: { type: 'string' } },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'brief_preview',
          description: 'Dry-run SessionBrief',
          parameters: {
            type: 'object',
            properties: {
              assignmentId: { type: 'string' },
              projectId: { type: 'string' },
            },
            required: ['assignmentId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'preview_fanout_targets',
          description: 'Resolve global fan-out targets',
          parameters: {
            type: 'object',
            properties: { assignmentId: { type: 'string' } },
            required: ['assignmentId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'nudge_run',
          description: 'Nudge assignment (fan-out if global)',
          parameters: {
            type: 'object',
            properties: {
              assignmentId: { type: 'string' },
              text: { type: 'string' },
            },
            required: ['assignmentId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'analyze_project',
          description: 'Refresh project analyzer facts',
          parameters: {
            type: 'object',
            properties: { projectId: { type: 'string' } },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_assignment',
          description: 'Create assignment; fanOut required when projectId omitted',
          parameters: {
            type: 'object',
            properties: {
              projectId: { type: 'string' },
              profileId: { type: 'string' },
              scheduleMode: { type: 'string' },
              reviewMode: { type: 'string' },
              cronExpr: { type: 'string' },
              fanOut: { type: 'object' },
            },
          },
        },
      },
    ]

    type Msg = { role: string; content?: string | null; tool_calls?: unknown; tool_call_id?: string; name?: string }
    const messages: Msg[] = [
      {
        role: 'system',
        content: `You are the agent-kernel operator. Scope projectId=${scope.projectId ?? 'overview'}. Use tools for control-plane actions. Never invent fake run results.`,
      },
      { role: 'user', content: message },
    ]
    const toolResults: unknown[] = []
    let finalReply = ''

    for (let round = 0; round < 6; round++) {
      const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'default',
          messages,
          tools,
          tool_choice: 'auto',
        }),
      })
      if (!res.ok) {
        throw new Error(`GateWay HTTP ${res.status}: ${await res.text()}`)
      }
      const json = (await res.json()) as {
        choices?: {
          message?: {
            content?: string | null
            tool_calls?: {
              id: string
              function: { name: string; arguments: string }
            }[]
          }
          finish_reason?: string
        }[]
      }
      const msg = json.choices?.[0]?.message
      if (!msg) throw new Error('GateWay returned empty message')
      messages.push(msg as Msg)
      const calls = msg.tool_calls ?? []
      if (!calls.length) {
        finalReply = msg.content ?? ''
        // legacy JSON-in-content fallback
        const trimmed = (msg.content ?? '').trim()
        if (trimmed.startsWith('{') && trimmed.includes('"tool"')) {
          try {
            const call = JSON.parse(trimmed) as Parameters<Kernel['dispatchTool']>[0]
            toolResults.push(await this.dispatchTool(call, scope))
            finalReply = JSON.stringify(toolResults[toolResults.length - 1], null, 2)
          } catch (e) {
            toolResults.push({ error: e instanceof Error ? e.message : String(e) })
          }
        }
        break
      }
      for (const tc of calls) {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>
        } catch {
          args = {}
        }
        let result: unknown
        try {
          result = await this.dispatchTool(
            { tool: tc.function.name, ...args } as Parameters<Kernel['dispatchTool']>[0],
            scope,
          )
        } catch (e) {
          result = { error: e instanceof Error ? e.message : String(e) }
        }
        toolResults.push({ tool: tc.function.name, result })
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        })
      }
    }

    if (!finalReply && toolResults.length) {
      finalReply = `Executed ${toolResults.length} tool call(s).`
    }
    return { reply: finalReply, toolResults }
  }
}
