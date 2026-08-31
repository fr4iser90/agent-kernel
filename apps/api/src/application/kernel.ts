import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { SessionBrief } from '@agent-kernel/session-brief'
import type { ProjectRepository } from '../domain/catalog/project-repository.js'
import type { Project } from '../domain/catalog/project.js'
import {
  DEFAULT_USER_EXECUTOR,
  normalizeUserExecutorSettings,
  type User,
  type UserExecutorSettings,
} from '../domain/identity/user.js'
import {
  DEFAULT_SETTINGS,
  userExecutorSetupGaps,
  type AgentKernelSettings,
} from '../domain/settings/settings.js'
import type {
  ExecutorJobKind,
  ExecutorJobRow,
  ExecutorJobView,
} from '../domain/executor/jobs.js'
import { hashPassword, verifyPassword } from '../infrastructure/auth/password.js'
import { cronMatches } from '../infrastructure/cron.js'
import { executorDeviceHub } from '../infrastructure/executor/device-hub.js'
import { GitHubClient } from '../infrastructure/github/github-client.js'
import {
  fetchGithubReposForImport,
  matchGithubReposToDevice,
  type DeviceWorkdirCandidate,
  type GithubRepoMatch,
} from '../infrastructure/catalog/local-and-github.js'
import type { SqliteSettingsRepository } from '../infrastructure/sqlite/settings-repository.js'
import type Database from 'better-sqlite3'
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
    const normalized: Partial<AgentKernelSettings> = { ...patch }
    const next: AgentKernelSettings = {
      ...cur,
      ...normalized,
      layoutPaths: { ...cur.layoutPaths, ...(normalized.layoutPaths ?? {}) },
      schemaVersion: 1,
    }
    if (next.dshEndpoint && !next.dshTrustedHost) {
      try {
        next.dshTrustedHost = new URL(next.dshEndpoint).host
      } catch {
        /* keep null */
      }
    }
    if (normalized.githubSignupMode !== undefined) {
      if (!['closed', 'open', 'allowlist'].includes(next.githubSignupMode)) {
        throw new Error('githubSignupMode must be closed | open | allowlist')
      }
      if (next.githubSignupMode === 'allowlist') {
        const list = (next.githubSignupAllowlist ?? [])
          .map((x) => String(x).trim().replace(/^@/, ''))
          .filter(Boolean)
        if (!list.length) {
          throw new Error('githubSignupMode=allowlist requires at least one GitHub login')
        }
        next.githubSignupAllowlist = list
      }
    }
    if (normalized.githubSignupAllowlist !== undefined) {
      next.githubSignupAllowlist = (normalized.githubSignupAllowlist ?? [])
        .map((x) => String(x).trim().replace(/^@/, ''))
        .filter(Boolean)
    }
    return this.deps.settingsRepo.put(next)
  }

  setupGaps(): string[] {
    return []
  }

  /** Where to send the user after auth (executor pairing only). */
  nextSetupStep(userId: string): 'executor' | null {
    const user = this.getUser(userId)
    if (!user) throw new Error('unauthorized')
    const gaps = userExecutorSetupGaps(this.getUserExecutorSettings(userId))
    if (gaps.length) return 'executor'
    return null
  }

  nextSetupPath(userId: string): '/setup' | '/overview' {
    return this.nextSetupStep(userId) === 'executor' ? '/setup' : '/overview'
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
    const empty = this.userCount() === 0
    return {
      authMode: s.authMode,
      allowBootstrapRegister: empty,
      githubOAuthConfigured: Boolean(
        (s.githubOAuthClientId || process.env.GITHUB_CLIENT_ID)?.trim(),
      ),
      githubSignupMode: s.githubSignupMode,
      userCount: this.userCount(),
      authRequiredForApi: s.authRequiredForApi,
      loginOptional: !s.authRequiredForApi,
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
    opts?: {
      provider?: string
      githubLogin?: string | null
      /** Prefer storing GitHub tokens on the user row only — not on the session. */
      accessToken?: string | null
      /** Session lifetime; default 14d. Device-pair sessions use a shorter TTL. */
      ttlMs?: number
    },
  ): string {
    const token = randomUUID()
    const now = Date.now()
    const ttlMs = opts?.ttlMs ?? 14 * 24 * 60 * 60_000
    const createdAt = new Date(now).toISOString()
    const expiresAt = new Date(now + ttlMs).toISOString()
    this.deps.db
      .prepare(
        `INSERT INTO sessions (token, owner_id, created_at, expires_at, provider, github_login, access_token)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        token,
        ownerId,
        createdAt,
        expiresAt,
        opts?.provider ?? 'password',
        opts?.githubLogin ?? null,
      )
    if (opts?.accessToken?.trim()) {
      this.deps.db
        .prepare(`UPDATE users SET github_access_token = ?, updated_at = ? WHERE id = ?`)
        .run(opts.accessToken.trim(), createdAt, ownerId)
    }
    return token
  }

  /** Public site base URL for MCP/device pairing (WEB_ORIGIN, else https://WEB_HOST). */
  publicKernelUrl(): string {
    const origin = process.env.WEB_ORIGIN?.trim().replace(/\/$/, '')
    if (origin) {
      try {
        // eslint-disable-next-line no-new
        new URL(origin)
      } catch {
        throw new Error('WEB_ORIGIN must be an absolute http(s) URL')
      }
      return origin
    }
    const host = process.env.WEB_HOST?.trim()
    if (!host) {
      throw new Error('WEB_ORIGIN or WEB_HOST required for device pairing')
    }
    if (host.includes('://')) {
      throw new Error('WEB_HOST must be a bare hostname, not a URL')
    }
    return `https://${host}`
  }

  /**
   * Start a device-code pair for MCP / DSH Header (like `gh auth` / Tailscale).
   * Code is single-use, 10 minutes TTL.
   */
  startDevicePair(ownerId: string): {
    code: string
    expiresAt: string
    kernelUrl: string
    pollIntervalMs: number
  } {
    if (!this.getUser(ownerId)) throw new Error('unauthorized')
    const kernelUrl = this.publicKernelUrl()
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const bytes = randomBytes(16)
    let raw = ''
    for (let i = 0; i < 12; i++) raw += alphabet[bytes[i]! % alphabet.length]
    const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`
    const createdAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
    this.deps.db
      .prepare(
        `INSERT INTO device_pairs (code, owner_id, created_at, expires_at, claimed_at, session_token)
         VALUES (?, ?, ?, ?, NULL, NULL)`,
      )
      .run(code, ownerId, createdAt, expiresAt)
    return { code, expiresAt, kernelUrl, pollIntervalMs: 2000 }
  }

  devicePairStatus(
    ownerId: string,
    code?: string,
  ): {
    status: 'pending' | 'claimed' | 'expired' | 'missing'
    code: string | null
    expiresAt: string | null
    claimedAt: string | null
    kernelUrl: string
  } {
    if (!this.getUser(ownerId)) throw new Error('unauthorized')
    const kernelUrl = this.publicKernelUrl()
    const row = (
      code
        ? (this.deps.db
            .prepare(
              `SELECT code, owner_id, expires_at, claimed_at FROM device_pairs WHERE code = ? AND owner_id = ?`,
            )
            .get(code, ownerId) as
            | { code: string; owner_id: string; expires_at: string; claimed_at: string | null }
            | undefined)
        : (this.deps.db
            .prepare(
              `SELECT code, owner_id, expires_at, claimed_at FROM device_pairs
               WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1`,
            )
            .get(ownerId) as
            | { code: string; owner_id: string; expires_at: string; claimed_at: string | null }
            | undefined)
    )
    if (!row) {
      return { status: 'missing', code: null, expiresAt: null, claimedAt: null, kernelUrl }
    }
    if (row.claimed_at) {
      return {
        status: 'claimed',
        code: row.code,
        expiresAt: row.expires_at,
        claimedAt: row.claimed_at,
        kernelUrl,
      }
    }
    if (Date.parse(row.expires_at) <= Date.now()) {
      return {
        status: 'expired',
        code: row.code,
        expiresAt: row.expires_at,
        claimedAt: null,
        kernelUrl,
      }
    }
    return {
      status: 'pending',
      code: row.code,
      expiresAt: row.expires_at,
      claimedAt: null,
      kernelUrl,
    }
  }

  /**
   * DSH/MCP claims a pairing code (no session cookie). Returns kernel URL + fresh session token.
   */
  claimDevicePair(codeRaw: string): { url: string; token: string; expiresAt: string } {
    const code = codeRaw.trim().toUpperCase().replace(/\s+/g, '')
    if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) {
      throw new Error('invalid pairing code')
    }
    const row = this.deps.db
      .prepare(
        `SELECT code, owner_id, expires_at, claimed_at FROM device_pairs WHERE code = ?`,
      )
      .get(code) as
      | { code: string; owner_id: string; expires_at: string; claimed_at: string | null }
      | undefined
    if (!row) throw new Error('pairing code unknown')
    if (row.claimed_at) throw new Error('pairing code already used')
    if (Date.parse(row.expires_at) <= Date.now()) throw new Error('pairing code expired')
    if (!this.getUser(row.owner_id)) throw new Error('pairing code unknown')
    const token = this.createSession(row.owner_id, {
      provider: 'device_pair',
      ttlMs: 24 * 60 * 60_000,
    })
    const claimedAt = new Date().toISOString()
    const updated = this.deps.db
      .prepare(
        `UPDATE device_pairs SET claimed_at = ?, session_token = ?
         WHERE code = ? AND claimed_at IS NULL`,
      )
      .run(claimedAt, token, code)
    if (updated.changes !== 1) throw new Error('pairing code already used')
    this.markExecutorPaired(row.owner_id)
    this.touchExecutorHeartbeat(row.owner_id, 'device_pair')
    const sessionExpires = this.deps.db
      .prepare(`SELECT expires_at FROM sessions WHERE token = ?`)
      .get(token) as { expires_at: string | null } | undefined
    return {
      url: this.publicKernelUrl(),
      token,
      expiresAt: sessionExpires?.expires_at ?? row.expires_at,
    }
  }

  /** Mark BYO executor as paired (setup gap closes). Only via claimDevicePair. */
  markExecutorPaired(ownerId: string): void {
    const cur = this.getUserExecutorSettings(ownerId)
    if (cur.executorPaired) return
    const next = normalizeUserExecutorSettings({
      ...cur,
      executorPaired: true,
      operatorLlm: cur.operatorLlm === 'gateway' ? 'gateway' : 'executor',
    })
    this.deps.db
      .prepare(
        `INSERT INTO user_settings (user_id, doc_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET doc_json = excluded.doc_json, updated_at = excluded.updated_at`,
      )
      .run(ownerId, JSON.stringify(next), new Date().toISOString())
  }

  revokeSession(token: string): void {
    this.deps.db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token)
  }

  /**
   * Absolute http(s) GateWay base URL. Blocks cloud metadata / link-local SSRF targets.
   * Hosted/hybrid also blocks loopback and RFC1918 (no shared-network SSRF).
   */
  private assertSafeGatewayUrl(raw: string): string {
    let u: URL
    try {
      u = new URL(raw)
    } catch {
      throw new Error('gatewayUrl must be an absolute http(s) URL')
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error('gatewayUrl must use http or https')
    }
    const host = u.hostname.toLowerCase()
    if (
      host === '169.254.169.254' ||
      host === 'metadata.google.internal' ||
      host === 'metadata' ||
      host.endsWith('.metadata.google.internal')
    ) {
      throw new Error('gatewayUrl host not allowed')
    }
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host === 'host.docker.internal'
    ) {
      throw new Error('gatewayUrl must not target loopback/internal hosts')
    }
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
    if (m) {
      const a = Number(m[1])
      const b = Number(m[2])
      const privateIp =
        a === 10 ||
        a === 127 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254)
      if (privateIp) {
        throw new Error('gatewayUrl must not target private IP ranges')
      }
    }
    return u.toString().replace(/\/$/, '')
  }

  private resolveLawpackRel(packRoot: string, rel: string): string {
    const cleaned = rel.trim().replace(/^\/+/, '').replace(/\\/g, '/')
    if (!cleaned || cleaned.includes('..')) {
      throw new Error('lawpack relative path must not contain ..')
    }
    const pack = resolve(packRoot)
    const abs = resolve(pack, cleaned)
    if (abs !== pack && !abs.startsWith(`${pack}/`)) {
      throw new Error('lawpack path escape blocked')
    }
    return abs
  }

  touchExecutorHeartbeat(ownerId: string, deviceLabel?: string): void {
    if (!this.getUser(ownerId)) throw new Error('unauthorized')
    const now = new Date().toISOString()
    this.deps.db
      .prepare(
        `INSERT INTO executor_heartbeats (owner_id, last_seen_at, device_label) VALUES (?, ?, ?)
         ON CONFLICT(owner_id) DO UPDATE SET
           last_seen_at = excluded.last_seen_at,
           device_label = COALESCE(excluded.device_label, executor_heartbeats.device_label)`,
      )
      .run(ownerId, now, deviceLabel ?? null)
  }

  executorHeartbeat(ownerId: string): { lastSeenAt: string | null; deviceLabel: string | null } {
    const row = this.deps.db
      .prepare(`SELECT last_seen_at, device_label FROM executor_heartbeats WHERE owner_id = ?`)
      .get(ownerId) as { last_seen_at: string; device_label: string | null } | undefined
    return {
      lastSeenAt: row?.last_seen_at ?? null,
      deviceLabel: row?.device_label ?? null,
    }
  }

  ownerFromToken(token: string | undefined | null): string | null {
    if (!token) return null
    const row = this.deps.db
      .prepare(`SELECT owner_id, expires_at FROM sessions WHERE token = ?`)
      .get(token) as { owner_id: string; expires_at: string | null } | undefined
    if (!row) return null
    if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
      this.deps.db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token)
      return null
    }
    return row.owner_id
  }

  sessionInfo(token: string | undefined | null): {
    ownerId: string
    provider: string
    githubLogin: string | null
    username: string | null
    role: string | null
  } | null {
    if (!token) return null
    if (!this.ownerFromToken(token)) return null
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
    const executorGaps = this.setupGapsForUser(user.id)
    const nextSetup = this.nextSetupStep(user.id)
    const nextPath = this.nextSetupPath(user.id)
    return {
      token,
      ownerId: user.id,
      username: user.username,
      role: user.role,
      githubLogin: user.githubLogin,
      provider,
      executorSetupRequired: nextSetup === 'executor',
      setupRequired: nextSetup === 'executor',
      setupGaps: executorGaps,
      nextSetup,
      nextPath,
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
    const id = randomUUID()
    const now = new Date().toISOString()
    this.deps.db.exec('BEGIN IMMEDIATE')
    try {
      if (this.getUserByUsername(username)) throw new Error('username taken')
      const countNow = this.userCount()
      if (countNow === 0) {
        // First admin on empty host — always allowed.
      } else if (input.bootstrap) {
        throw new Error('bootstrap only when no users exist')
      } else {
        throw new Error('registration closed — ask an admin (use GitHub login or admin invite later)')
      }
      const role = countNow === 0 ? 'admin' : (input.role ?? 'operator')
      this.deps.db
        .prepare(
          `INSERT INTO users (id, username, password_hash, github_id, github_login, github_access_token, role, created_at, updated_at)
           VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
        )
        .run(id, username, hashPassword(input.password), role, now, now)
      this.ensureUserSettings(id)
      this.deps.db.exec('COMMIT')
    } catch (e) {
      try {
        this.deps.db.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw e
    }
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
    // Never auto-link by username — that enables account takeover via matching GitHub login.
    // New account — gated by githubSignupMode (default closed).
    const count = this.userCount()
    const s = this.settings()
    if (count === 0) {
      // First admin on empty host — always allowed.
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

  githubOAuthStartUrl(redirectUri?: string | null): { url: string; state: string } {
    const s = this.settings()
    const clientId =
      s.githubOAuthClientId?.trim() || process.env.GITHUB_CLIENT_ID?.trim() || null
    const redirect =
      redirectUri?.trim() ||
      s.githubOAuthRedirectUri?.trim() ||
      process.env.GITHUB_REDIRECT_URI?.trim() ||
      null
    if (!clientId) {
      throw new Error('GitHub OAuth not configured — set githubOAuthClientId / GITHUB_CLIENT_ID')
    }
    if (!redirect) {
      throw new Error(
        'GitHub OAuth redirect URI missing — pass request origin or set GITHUB_REDIRECT_URI',
      )
    }
    const state = randomUUID()
    this.deps.db
      .prepare(
        `INSERT INTO kv (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(
        `oauth_state:${state}`,
        JSON.stringify({ at: Date.now(), redirect }),
      )
    return { url: GitHubClient.oauthAuthorizeUrl(clientId, redirect, state), state }
  }

  async loginGithubOAuthCode(code: string, state: string) {
    const st = this.deps.db.prepare(`SELECT value FROM kv WHERE key = ?`).get(`oauth_state:${state}`) as
      | { value: string }
      | undefined
    if (!st) throw new Error('invalid OAuth state')
    let at = Number.NaN
    let redirectFromState: string | null = null
    try {
      const parsed = JSON.parse(st.value) as { at?: number; redirect?: string }
      if (typeof parsed.at === 'number') at = parsed.at
      if (typeof parsed.redirect === 'string' && parsed.redirect.trim()) {
        redirectFromState = parsed.redirect.trim()
      }
    } catch {
      at = Number(st.value)
    }
    if (!Number.isFinite(at) || Date.now() - at > 10 * 60_000) {
      this.deps.db.prepare(`DELETE FROM kv WHERE key = ?`).run(`oauth_state:${state}`)
      throw new Error('OAuth state expired')
    }
    this.deps.db.prepare(`DELETE FROM kv WHERE key = ?`).run(`oauth_state:${state}`)
    const s = this.settings()
    const clientId =
      s.githubOAuthClientId?.trim() || process.env.GITHUB_CLIENT_ID?.trim() || ''
    const clientSecret =
      s.githubOAuthClientSecret?.trim() || process.env.GITHUB_CLIENT_SECRET?.trim() || ''
    const redirect =
      redirectFromState ||
      s.githubOAuthRedirectUri?.trim() ||
      process.env.GITHUB_REDIRECT_URI?.trim() ||
      ''
    if (!clientId || !clientSecret) throw new Error('GitHub OAuth client id/secret missing')
    if (!redirect) {
      throw new Error('GitHub OAuth redirect URI missing for code exchange')
    }
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
    const parsed = JSON.parse(row.doc_json) as Partial<UserExecutorSettings> & Record<string, unknown>
    return normalizeUserExecutorSettings(parsed)
  }

  putUserExecutorSettings(
    userId: string,
    patch: Partial<UserExecutorSettings>,
  ): UserExecutorSettings {
    const cur = this.getUserExecutorSettings(userId)
    // executorPaired is set only by claimDevicePair / markExecutorPaired — never client mass-assign.
    const { executorPaired: _pairIgnored, ...rest } = patch
    void _pairIgnored
    const next = normalizeUserExecutorSettings({ ...cur, ...rest, executorPaired: cur.executorPaired })
    if (next.operatorLlm === 'gateway') {
      if (!next.gatewayUrl?.trim()) {
        throw new Error('operatorLlm=gateway requires gatewayUrl')
      }
      if (!next.gatewayApiKey?.trim()) {
        throw new Error('operatorLlm=gateway requires gatewayApiKey')
      }
      this.assertSafeGatewayUrl(next.gatewayUrl.trim())
    } else if (next.gatewayUrl?.trim()) {
      this.assertSafeGatewayUrl(next.gatewayUrl.trim())
    }
    this.deps.db
      .prepare(
        `INSERT INTO user_settings (user_id, doc_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET doc_json = excluded.doc_json, updated_at = excluded.updated_at`,
      )
      .run(userId, JSON.stringify(next), new Date().toISOString())
    return next
  }

  /** Setup status for BYO outbound DSH (pair + live WSS). */
  executorConnectGuide(userId: string): {
    mode: 'outbound_wss'
    paired: boolean
    wssConnected: boolean
    heartbeat: { lastSeenAt: string | null; deviceLabel: string | null }
    notes: string[]
  } {
    const s = this.getUserExecutorSettings(userId)
    return {
      mode: 'outbound_wss',
      paired: s.executorPaired,
      wssConnected: executorDeviceHub.hasLive(userId),
      heartbeat: this.executorHeartbeat(userId),
      notes: [
        'Same pair for every executor: agent-kernel-runner pair --url <kernel> --code <XXXX-XXXX-XXXX>',
        'Then keep agent-kernel-runner running (outbound WSS). DSH Header pair still works too.',
        'MCP tools: install the same stdio server in Claude / Aider / OpenCode / DSH (examples/print-mcp-configs.sh).',
        'Coding jobs use brief.executorId (dsh | claude-code | aider | opencode). Control plane is WSS only.',
      ],
    }
  }

  listProjects(ownerId: string): Project[] {
    return this.deps.projects.listByOwner(ownerId)
  }

  registerProject(
    ownerId: string,
    input: { name: string; localPath?: string; path?: string; gitRemote?: string | null },
  ): Project {
    const raw = (input.localPath ?? input.path)?.trim()
    if (!raw) throw new Error('path / localPath required')
    if (raw.includes('\0') || raw.length > 4096) throw new Error('invalid path')
    // Opaque executor workdir — kernel never existsSync / resolves host FS.
    return this.deps.projects.create({
      id: randomUUID(),
      ownerId,
      name: input.name,
      localPath: raw,
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
    const roleAbs = this.resolveLawpackRel(pack, rolePath)
    if (!existsSync(roleAbs)) throw new Error(`role file missing: ${roleAbs}`)
    if (input.overlay) {
      if (String(input.overlay).includes('..') || String(input.overlay).includes('/')) {
        throw new Error('overlay id must be a simple name')
      }
      const overlayAbs = this.resolveLawpackRel(pack, `profiles/${input.overlay}.md`)
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
    if (!existsSync(this.resolveLawpackRel(pack, rolePath))) {
      throw new Error(`role file missing: ${join(pack, rolePath)}`)
    }
    const overlay =
      patch.overlay !== undefined ? patch.overlay : (cur.lawpack_profile_overlay as string | null)
    if (overlay) {
      if (String(overlay).includes('..') || String(overlay).includes('/')) {
        throw new Error('overlay id must be a simple name')
      }
      const overlayAbs = this.resolveLawpackRel(pack, `profiles/${overlay}.md`)
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

  initPreview(ownerId: string, projectId: string, body: Record<string, unknown>) {
    this.requireProject(projectId, ownerId)
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

  initApply(ownerId: string, projectId: string, body: Record<string, unknown>): Project {
    // DB-only: status + assignment. Executor plants workdir files later (see plannedFiles).
    const plan = this.initPreview(ownerId, projectId, body)
    const p = this.requireProject(projectId, ownerId)
    const s = this.settings()

    if (s.installProtectHooks && s.gitPolicyEnabled) {
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

  requireProject(id: string, ownerId: string): Project {
    const p = this.deps.projects.getById(id)
    if (!p || p.ownerId !== ownerId) throw new Error(`project not found: ${id}`)
    return p
  }

  getProject(ownerId: string, id: string): Project | null {
    const p = this.deps.projects.getById(id)
    if (!p || p.ownerId !== ownerId) return null
    return p
  }

  listAssignments(ownerId: string, projectId: string | null) {
    if (projectId) {
      this.requireProject(projectId, ownerId)
      return this.deps.db
        .prepare(
          `SELECT * FROM assignments WHERE project_id = ? AND owner_id = ? ORDER BY created_at DESC`,
        )
        .all(projectId, ownerId)
    }
    return this.deps.db
      .prepare(
        `SELECT * FROM assignments WHERE owner_id = ? AND project_id IS NULL ORDER BY created_at DESC`,
      )
      .all(ownerId)
  }

  getAssignment(id: string) {
    return this.deps.db.prepare(`SELECT * FROM assignments WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined
  }

  requireAssignment(id: string, ownerId: string): Record<string, unknown> {
    const a = this.getAssignment(id)
    if (!a || String(a.owner_id) !== ownerId) throw new Error(`assignment not found: ${id}`)
    return a
  }

  requireRun(id: string, ownerId: string): Record<string, unknown> {
    const run = this.deps.db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined
    if (!run) throw new Error(`run not found: ${id}`)
    const a = this.getAssignment(String(run.assignment_id))
    if (!a || String(a.owner_id) !== ownerId) throw new Error(`run not found: ${id}`)
    return run
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
    if (input.projectId) this.requireProject(input.projectId, input.ownerId)
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
    ownerId: string,
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
    const cur = this.requireAssignment(id, ownerId)
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

  deleteAssignment(ownerId: string, id: string) {
    this.requireAssignment(id, ownerId)
    this.deps.db.prepare(`DELETE FROM assignments WHERE id = ?`).run(id)
    return { ok: true as const, id }
  }

  resolveFanOutTargets(ownerId: string, assignmentId: string): { projectIds: string[]; skipped: { id: string; reason: string }[] } {
    const a = this.requireAssignment(assignmentId, ownerId)
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
      projectIds.push(p.id)
    }
    return { projectIds, skipped }
  }

  buildBrief(ownerId: string, assignmentId: string, projectIdOverride?: string): SessionBrief {
    const a = this.requireAssignment(assignmentId, ownerId)
    const projectId = projectIdOverride ?? (a.project_id as string | null)
    if (!projectId) {
      throw new Error('brief requires projectId (use fan-out targets for global assignments)')
    }
    const p = this.requireProject(projectId, ownerId)
    const profile = this.deps.db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(a.profile_id) as
      | Record<string, unknown>
      | undefined
    if (!profile) throw new Error(`profile not found: ${a.profile_id}`)
    const s = this.settings()
    const pack = this.lawpackRoot(s)
    const rolePath = String(profile.role_path)
    const roleAbs = this.resolveLawpackRel(pack, rolePath)
    if (!existsSync(roleAbs)) throw new Error(`role file missing: ${roleAbs}`)
    let roleText = readFileSync(roleAbs, 'utf8')
    const overlay = profile.lawpack_profile_overlay
      ? this.resolveLawpackRel(pack, `profiles/${profile.lawpack_profile_overlay}.md`)
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

  /** Health for paired outbound executor — requires live WSS. */
  async pingDsh(ownerId: string): Promise<{
    paired: boolean
    lastSeenAt: string | null
    wssConnected: boolean
    executorId: string
  }> {
    const s = this.getUserExecutorSettings(ownerId)
    if (!s.executorPaired) {
      throw new Error('Executor not paired — generate a code and claim it from your device')
    }
    const live = executorDeviceHub.hasLive(ownerId)
    const hb = this.executorHeartbeat(ownerId)
    if (!live) {
      throw new Error(
        'No live WSS — start DSH with agent-kernel-mcp, or run agent-kernel-runner (Claude/Aider/OpenCode)',
      )
    }
    return {
      paired: true,
      lastSeenAt: hb.lastSeenAt,
      wssConnected: true,
      executorId: s.executorId,
    }
  }

  private enqueueExecutorJob(
    ownerId: string,
    runId: string,
    kind: ExecutorJobKind,
    payload: Record<string, unknown>,
  ): ExecutorJobView {
    if (!executorDeviceHub.hasLive(ownerId)) {
      throw new Error(
        'No paired device connected over WSS — open DSH with agent-kernel-mcp, or run agent-kernel-runner',
      )
    }
    const id = randomUUID()
    const createdAt = new Date().toISOString()
    this.deps.db
      .prepare(
        `INSERT INTO executor_jobs
         (id, owner_id, run_id, kind, status, payload_json, result_json, error_text, created_at, claimed_at, completed_at)
         VALUES (?, ?, ?, ?, 'pending', ?, NULL, NULL, ?, NULL, NULL)`,
      )
      .run(id, ownerId, runId, kind, JSON.stringify(payload), createdAt)
    const view: ExecutorJobView = { id, runId, kind, payload, createdAt }
    const n = executorDeviceHub.push(ownerId, {
      type: 'job.created',
      jobId: id,
      runId,
      kind,
      payload,
      createdAt,
    })
    if (n < 1) {
      this.deps.db
        .prepare(
          `UPDATE executor_jobs SET status = 'failed', error_text = ?, completed_at = ? WHERE id = ?`,
        )
        .run('WSS push failed — no live device', new Date().toISOString(), id)
      throw new Error('WSS push failed — no live device socket')
    }
    return view
  }

  /** On WSS reconnect: re-push pending jobs (at-least-once). */
  pushPendingJobsToDevice(ownerId: string): number {
    if (!this.getUser(ownerId)) throw new Error('unauthorized')
    if (!executorDeviceHub.hasLive(ownerId)) return 0
    const rows = this.deps.db
      .prepare(
        `SELECT * FROM executor_jobs
         WHERE owner_id = ? AND status = 'pending'
         ORDER BY created_at ASC`,
      )
      .all(ownerId) as ExecutorJobRow[]
    let n = 0
    for (const row of rows) {
      n += executorDeviceHub.push(ownerId, {
        type: 'job.created',
        jobId: row.id,
        runId: row.run_id,
        kind: row.kind,
        payload: JSON.parse(row.payload_json) as Record<string, unknown>,
        createdAt: row.created_at,
      })
    }
    return n
  }

  markExecutorJobClaimed(ownerId: string, jobId: string): void {
    if (!this.getUser(ownerId)) throw new Error('unauthorized')
    const updated = this.deps.db
      .prepare(
        `UPDATE executor_jobs SET status = 'claimed', claimed_at = ?
         WHERE id = ? AND owner_id = ? AND status = 'pending'`,
      )
      .run(new Date().toISOString(), jobId, ownerId)
    if (updated.changes !== 1) {
      // already claimed/completed is ok (at-least-once delivery)
      const row = this.deps.db
        .prepare(`SELECT status FROM executor_jobs WHERE id = ? AND owner_id = ?`)
        .get(jobId, ownerId) as { status: string } | undefined
      if (!row) throw new Error('executor job not found')
    }
    this.touchExecutorHeartbeat(ownerId)
  }

  completeExecutorJob(
    ownerId: string,
    jobId: string,
    body: {
      ok: boolean
      result?: Record<string, unknown>
      error?: string
    },
  ): { runId: string; status: string } {
    if (!this.getUser(ownerId)) throw new Error('unauthorized')
    this.touchExecutorHeartbeat(ownerId)

    const row = this.deps.db
      .prepare(`SELECT * FROM executor_jobs WHERE id = ? AND owner_id = ?`)
      .get(jobId, ownerId) as ExecutorJobRow | undefined
    if (!row) throw new Error('executor job not found')
    if (row.status === 'completed' || row.status === 'failed') {
      throw new Error(`executor job already ${row.status}`)
    }
    if (row.status !== 'claimed' && row.status !== 'pending') {
      throw new Error(`executor job status=${row.status}`)
    }
    if (row.status === 'pending') {
      this.deps.db
        .prepare(
          `UPDATE executor_jobs SET status = 'claimed', claimed_at = ? WHERE id = ? AND status = 'pending'`,
        )
        .run(new Date().toISOString(), jobId)
    }

    const completedAt = new Date().toISOString()
    if (!body.ok) {
      const err = body.error?.trim() || 'executor job failed'
      this.deps.db
        .prepare(
          `UPDATE executor_jobs SET status = 'failed', error_text = ?, completed_at = ?, result_json = ?
           WHERE id = ?`,
        )
        .run(err, completedAt, body.result ? JSON.stringify(body.result) : null, jobId)
      if (!row.run_id.startsWith('operator:') && !row.run_id.startsWith('detect:')) {
        this.deps.db
          .prepare(
            `UPDATE runs SET outcome = 'failed', ended_at = ?, deny_reason = ? WHERE id = ? AND outcome IN ('queued', 'waiting_executor', 'running')`,
          )
          .run(completedAt, err.slice(0, 500), row.run_id)
      }
      return { runId: row.run_id, status: 'failed' }
    }

    const result = body.result ?? {}
    this.deps.db
      .prepare(
        `UPDATE executor_jobs SET status = 'completed', completed_at = ?, result_json = ?, error_text = NULL
         WHERE id = ?`,
      )
      .run(completedAt, JSON.stringify(result), jobId)

    if (row.kind === 'start') {
      const sessionId = String(result.executorSessionId ?? '').trim()
      if (!sessionId) throw new Error('start job result requires executorSessionId')
      this.deps.db
        .prepare(
          `UPDATE runs SET executor_session_id = ?, outcome = 'running', ended_at = NULL, deny_reason = NULL
           WHERE id = ?`,
        )
        .run(sessionId, row.run_id)
    } else if (row.kind === 'nudge') {
      /* keep running */
    } else if (row.kind === 'fetch_transcript') {
      if (result.transcript === undefined) {
        throw new Error('fetch_transcript result requires transcript')
      }
      this.deps.db
        .prepare(`UPDATE runs SET transcript_json = ? WHERE id = ?`)
        .run(JSON.stringify(result.transcript), row.run_id)
      const running = Boolean(
        (result.transcript as { session?: { running?: boolean } })?.session?.running,
      )
      if (running) {
        this.deps.db
          .prepare(`UPDATE runs SET outcome = 'running', ended_at = NULL WHERE id = ?`)
          .run(row.run_id)
      } else {
        this.deps.db
          .prepare(
            `UPDATE runs SET outcome = 'completed', ended_at = COALESCE(ended_at, ?) WHERE id = ?`,
          )
          .run(completedAt, row.run_id)
      }
    } else if (row.kind === 'operator_turn') {
      if (typeof result.reply !== 'string' || !result.reply.trim()) {
        throw new Error('operator_turn result requires non-empty reply string')
      }
    } else if (row.kind === 'list_workdir_candidates') {
      if (!Array.isArray(result.candidates)) {
        throw new Error('list_workdir_candidates result requires candidates array')
      }
    }

    return { runId: row.run_id, status: 'completed' }
  }

  private policyCheck(ownerId: string, brief: SessionBrief): void {
    const s = this.settings()
    const p = this.requireProject(brief.projectId, ownerId)
    const decision = authorizeSessionStart({
      brief,
      projectStatus: p.status,
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
    const gatewayUrl = ue.gatewayUrl?.trim() || null
    const gatewayKey = ue.gatewayApiKey?.trim() || null
    if (!gatewayUrl || !gatewayKey) {
      return {
        ...brief,
        reviewProposal:
          '(no GateWay configured — human must approve from Brief alone; set My Executor gatewayUrl to attach an LLM proposal)',
      }
    }
    const safeGw = this.assertSafeGatewayUrl(gatewayUrl)
    const res = await fetch(`${safeGw}/v1/chat/completions`, {
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
    const brief = this.buildBrief(ownerId, assignmentId, projectId)
    this.policyCheck(ownerId, brief)

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
    const ue = this.getUserExecutorSettings(ownerId)
    const gaps = userExecutorSetupGaps(ue)
    if (gaps.length) {
      throw new Error(
        `My Executor incomplete: ${gaps.join(', ')}. Pair your DSH before starting runs.`,
      )
    }

    const briefJson = JSON.stringify(brief)
    const hash = createHash('sha256').update(briefJson).digest('hex').slice(0, 16)
    const now = new Date().toISOString()

    const last = this.deps.db
      .prepare(
        `SELECT id, executor_session_id FROM runs
         WHERE assignment_id = ? AND project_id = ? AND outcome IN ('running', 'queued', 'waiting_executor')
         ORDER BY started_at DESC LIMIT 1`,
      )
      .get(brief.assignmentId, brief.projectId) as
      | { id: string; executor_session_id: string | null }
      | undefined

    let runId = existingRunId
    if (!runId) {
      runId = randomUUID()
      this.deps.db
        .prepare(
          `INSERT INTO runs
           (id, assignment_id, project_id, executor_id, executor_session_id, started_at, ended_at, outcome, brief_json, brief_hash, deny_reason)
           VALUES (?, ?, ?, ?, NULL, ?, NULL, 'queued', ?, ?, NULL)`,
        )
        .run(
          runId,
          brief.assignmentId,
          brief.projectId,
          brief.executorId,
          now,
          briefJson,
          hash,
        )
    } else {
      this.deps.db
        .prepare(
          `UPDATE runs SET outcome = 'queued', ended_at = NULL, brief_json = ?, brief_hash = ?, deny_reason = NULL
           WHERE id = ?`,
        )
        .run(briefJson, hash, runId)
    }

    const existingSession = last?.executor_session_id?.trim()
    if (existingSession && promptText?.trim()) {
      this.enqueueExecutorJob(ownerId, runId, 'nudge', {
        brief,
        executorSessionId: existingSession,
        prompt: promptText.trim(),
      })
      this.deps.db
        .prepare(
          `UPDATE runs SET executor_session_id = ?, outcome = 'waiting_executor' WHERE id = ?`,
        )
        .run(existingSession, runId)
    } else {
      this.enqueueExecutorJob(ownerId, runId, 'start', {
        brief,
        prompt: promptText?.trim() || null,
      })
      this.deps.db
        .prepare(`UPDATE runs SET outcome = 'waiting_executor' WHERE id = ?`)
        .run(runId)
    }

    return this.deps.db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId)
  }

  /** Approve an llm_propose run — only then ExecutorPort.start. */
  async approveRun(ownerId: string, runId: string) {
    const run = this.requireRun(runId, ownerId)
    if (String(run.outcome) !== 'awaiting_review') {
      throw new Error(`run ${runId} is not awaiting_review (got ${run.outcome})`)
    }
    if (!run.brief_json) throw new Error(`run ${runId} missing brief_json`)
    const parsed = JSON.parse(String(run.brief_json)) as SessionBrief & {
      pendingPrompt?: string | null
    }
    const { pendingPrompt, ...brief } = parsed
    this.policyCheck(ownerId, brief)
    const gaps = this.setupGapsForUser(ownerId)
    if (gaps.length) {
      throw new Error(`Setup incomplete: ${gaps.join(', ')}. Finish setup / My Executor.`)
    }
    return this.startExecutorRun(brief, ownerId, pendingPrompt ?? undefined, String(run.id))
  }

  rejectRun(ownerId: string, runId: string, reason?: string) {
    const run = this.requireRun(runId, ownerId)
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

  async nudge(ownerId: string, assignmentId: string, promptText?: string) {
    const a = this.requireAssignment(assignmentId, ownerId)
    const gaps = this.setupGapsForUser(ownerId)
    if (gaps.length) {
      throw new Error(`Setup incomplete: ${gaps.join(', ')}. Finish setup / My Executor.`)
    }
    if (a.paused) throw new Error('assignment is paused')
    const { projectIds } = this.resolveFanOutTargets(ownerId, assignmentId)
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
    const a = this.getAssignment(assignmentId)
    if (!a) throw new Error(`assignment not found: ${assignmentId}`)
    await this.nudge(String(a.owner_id), assignmentId, prompt)
    return true
  }

  listRuns(ownerId: string, projectId?: string) {
    if (projectId) {
      this.requireProject(projectId, ownerId)
      return this.deps.db
        .prepare(
          `SELECT r.* FROM runs r
           INNER JOIN assignments a ON a.id = r.assignment_id
           WHERE r.project_id = ? AND a.owner_id = ?
           ORDER BY r.started_at DESC`,
        )
        .all(projectId, ownerId)
    }
    return this.deps.db
      .prepare(
        `SELECT r.* FROM runs r
         INNER JOIN assignments a ON a.id = r.assignment_id
         WHERE a.owner_id = ?
         ORDER BY r.started_at DESC LIMIT 100`,
      )
      .all(ownerId)
  }

  getRun(id: string) {
    return this.deps.db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id)
  }

  /**
   * Transcript via outbound fetch_transcript job + cache on runs.transcript_json.
   * Kernel never dials DSH.
   */
  async getRunTranscript(ownerId: string, runId: string) {
    const run = this.requireRun(runId, ownerId) as {
      id: string
      assignment_id: string
      project_id: string
      executor_session_id: string | null
      outcome: string | null
      started_at: string
      ended_at: string | null
      transcript_json: string | null
    }
    const sessionId = run.executor_session_id?.trim()
    if (!sessionId) {
      throw new Error(
        `run ${runId} has no executor_session_id yet (outcome=${run.outcome}) — waiting for paired DSH over WSS to complete the start job`,
      )
    }

    const gaps = userExecutorSetupGaps(this.getUserExecutorSettings(ownerId))
    if (gaps.length) {
      throw new Error(`My Executor incomplete: ${gaps.join(', ')}`)
    }

    const pending = this.deps.db
      .prepare(
        `SELECT id FROM executor_jobs
         WHERE run_id = ? AND kind = 'fetch_transcript' AND status IN ('pending', 'claimed')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(runId) as { id: string } | undefined

    if (!pending) {
      this.enqueueExecutorJob(ownerId, runId, 'fetch_transcript', {
        executorSessionId: sessionId,
      })
    }

    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      const fresh = this.getRun(runId) as { transcript_json: string | null } | undefined
      if (fresh?.transcript_json) {
        const transcript = JSON.parse(fresh.transcript_json) as {
          session: {
            sessionId: string
            running: boolean
            blank: boolean
            cwd: string | null
            title: string | null
            updatedAt: number
            agentPreset?: string | null
          }
          messages: unknown[]
          fileOps: unknown[]
          rawEvents: unknown[]
          meta: { historyPages: number; eventCount: number }
        }
        return {
          run: this.getRun(runId),
          session: transcript.session,
          historyPages: transcript.meta.historyPages,
          eventCount: transcript.meta.eventCount,
          messages: transcript.messages,
          fileOps: transcript.fileOps,
          rawEvents: transcript.rawEvents,
          executorId: 'dsh',
        }
      }
      const failed = this.deps.db
        .prepare(
          `SELECT error_text FROM executor_jobs
           WHERE run_id = ? AND kind = 'fetch_transcript' AND status = 'failed'
           ORDER BY completed_at DESC LIMIT 1`,
        )
        .get(runId) as { error_text: string | null } | undefined
      if (failed?.error_text) {
        throw new Error(`transcript job failed: ${failed.error_text}`)
      }
      await new Promise((r) => setTimeout(r, 400))
    }
    throw new Error(
      'transcript not available — paired DSH did not complete fetch_transcript within 20s (is DSH running?)',
    )
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
        return this.listAssignments(scope.ownerId, call.projectId ?? scope.projectId ?? null)
      case 'brief_preview':
        if (!call.assignmentId) throw new Error('assignmentId required')
        return this.buildBrief(scope.ownerId, call.assignmentId, call.projectId)
      case 'preview_fanout_targets':
        if (!call.assignmentId) throw new Error('assignmentId required')
        return this.resolveFanOutTargets(scope.ownerId, call.assignmentId)
      case 'nudge_run':
        if (!call.assignmentId) throw new Error('assignmentId required')
        return this.nudge(scope.ownerId, call.assignmentId, call.text)
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

  /** Ask the paired device for workdir candidates (no kernel filesystem access). */
  async detectWorkdirCandidates(ownerId: string): Promise<{
    candidates: DeviceWorkdirCandidate[]
    detectRoots: string[]
  }> {
    if (!this.getUser(ownerId)) throw new Error('unauthorized')
    const s = this.getUserExecutorSettings(ownerId)
    if (!s.executorPaired) {
      throw new Error('Pair your executor first — detect runs on the device over WSS')
    }
    if (!executorDeviceHub.hasLive(ownerId)) {
      throw new Error('No live WSS — start agent-kernel-runner (or DSH) to detect workdirs')
    }
    const detectRoots = s.detectRoots
    const runId = `detect:${randomUUID()}`
    const job = this.enqueueExecutorJob(ownerId, runId, 'list_workdir_candidates', {
      roots: detectRoots,
    })
    const result = await this.waitExecutorJobResult(ownerId, job.id, 30_000)
    const raw = result.candidates
    if (!Array.isArray(raw)) {
      throw new Error('list_workdir_candidates returned no candidates array')
    }
    const candidates: DeviceWorkdirCandidate[] = []
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const rec = item as Record<string, unknown>
      const path = typeof rec.path === 'string' ? rec.path.trim() : ''
      if (!path) continue
      const name =
        typeof rec.name === 'string' && rec.name.trim()
          ? rec.name.trim()
          : path.split(/[/\\]/).filter(Boolean).pop() || path
      const source = typeof rec.source === 'string' && rec.source.trim() ? rec.source.trim() : 'device'
      const gitRemote =
        typeof rec.gitRemote === 'string' && rec.gitRemote.trim() ? rec.gitRemote.trim() : null
      candidates.push({ path, name, source, gitRemote })
    }
    if (candidates.length === 0) {
      throw new Error(
        detectRoots.length
          ? 'Device returned no workdirs under detectRoots / sessions — check paths on the device'
          : 'Device returned no workdirs — open a coding session, or set detectRoots (Setup) to parent folders on the device',
      )
    }
    return { candidates, detectRoots }
  }

  /**
   * GitHub repos (metadata) + device detect match.
   * on_device ≠ executor-ready clone by GitHub alone — requires a local path match.
   */
  async listGithubReposWithDeviceMatch(ownerId: string): Promise<{
    detectRoots: string[]
    device: DeviceWorkdirCandidate[]
    github: GithubRepoMatch[]
  }> {
    const token = this.getUser(ownerId)?.githubAccessToken
    if (!token?.trim()) {
      throw new Error('GitHub login required to list repos — sign in with GitHub (or PAT)')
    }
    const { candidates, detectRoots } = await this.detectWorkdirCandidates(ownerId)
    const repos = await fetchGithubReposForImport(token, { visibility: 'all' })
    return {
      detectRoots,
      device: candidates,
      github: matchGithubReposToDevice(repos, candidates),
    }
  }

  private async waitExecutorJobResult(
    ownerId: string,
    jobId: string,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const row = this.deps.db
        .prepare(`SELECT * FROM executor_jobs WHERE id = ? AND owner_id = ?`)
        .get(jobId, ownerId) as ExecutorJobRow | undefined
      if (!row) throw new Error(`executor job missing: ${jobId}`)
      if (row.status === 'completed') {
        if (!row.result_json) throw new Error(`executor job ${jobId} completed without result_json`)
        return JSON.parse(row.result_json) as Record<string, unknown>
      }
      if (row.status === 'failed') {
        throw new Error(row.error_text?.trim() || `executor job ${jobId} failed`)
      }
      await new Promise((r) => setTimeout(r, 400))
    }
    throw new Error(`executor job ${jobId} timed out after ${timeoutMs}ms`)
  }

  private async operatorChatViaExecutor(
    message: string,
    scope: { projectId?: string; ownerId: string },
  ): Promise<{ reply: string; toolResults: unknown[] }> {
    const runId = `operator:${randomUUID()}`
    const job = this.enqueueExecutorJob(scope.ownerId, runId, 'operator_turn', {
      message,
      projectId: scope.projectId ?? null,
      agentPreset: 'operator',
      systemPrompt: [
        'You are the agent-kernel operator (control plane only).',
        `Scope projectId=${scope.projectId ?? 'overview'}.`,
        'Use only agent-kernel MCP / kernel tools for control-plane actions.',
        'Do not edit product code, run shells, or invent fake run results.',
        'If a tool is unavailable, say so — do not improvise.',
      ].join(' '),
    })
    const result = await this.waitExecutorJobResult(scope.ownerId, job.id, 180_000)
    const reply = typeof result.reply === 'string' ? result.reply.trim() : ''
    if (!reply) throw new Error('operator_turn returned empty reply')
    return {
      reply,
      toolResults: Array.isArray(result.toolResults) ? result.toolResults : [],
    }
  }

  private async operatorChatViaGateway(
    message: string,
    scope: { projectId?: string; ownerId: string },
    ue: UserExecutorSettings,
  ): Promise<{ reply: string; toolResults: unknown[] }> {
    const gatewayUrl = ue.gatewayUrl?.trim()
    const key = ue.gatewayApiKey?.trim()
    if (!gatewayUrl) {
      throw new Error('operatorLlm=gateway requires gatewayUrl on My Executor')
    }
    if (!key) {
      throw new Error('operatorLlm=gateway requires gatewayApiKey on My Executor')
    }

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

    const safeGw = this.assertSafeGatewayUrl(gatewayUrl)
    for (let round = 0; round < 6; round++) {
      const res = await fetch(`${safeGw}/v1/chat/completions`, {
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
    if (ue.operatorLlm === 'executor') {
      return this.operatorChatViaExecutor(message, scope)
    }
    if (ue.operatorLlm === 'gateway') {
      return this.operatorChatViaGateway(message, scope, ue)
    }
    throw new Error(`operatorLlm must be executor|gateway (got ${String(ue.operatorLlm)})`)
  }
}
