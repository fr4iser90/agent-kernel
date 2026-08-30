import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { api, type Assignment, type Project, type Profile, type PublicConfig, type Run } from './api'
import './App.css'

type Me = {
  ownerId: string
  username?: string | null
  role?: string | null
  setupGaps: string[]
  githubLogin?: string | null
}

const MeCtx = createContext<{
  me: Me | null
  refresh: () => Promise<void>
  clear: () => void
}>({ me: null, refresh: async () => {}, clear: () => {} })

function useMe() {
  return useContext(MeCtx)
}

function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const refresh = useCallback(async () => {
    try {
      const m = await api.me()
      setMe(m)
    } catch {
      setMe(null)
    }
  }, [])
  const clear = useCallback(() => setMe(null), [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  const value = useMemo(() => ({ me, refresh, clear }), [me, refresh, clear])
  return <MeCtx.Provider value={value}>{children}</MeCtx.Provider>
}

function Shell({ children, variant = 'app' }: { children: ReactNode; variant?: 'app' | 'public' }) {
  const { me, clear } = useMe()
  const nav = useNavigate()
  async function logout() {
    try {
      await api.logout()
    } catch {
      /* ignore */
    }
    clear()
    nav('/')
  }

  if (variant === 'public') {
    return (
      <div className="public-frame">
        <header className="public-top">
          <Link to="/" className="brand">
            agent<span>-</span>kernel
          </Link>
          <div className="public-top-actions">
            {me ? (
              <Link className="btn" to="/overview">
                Open app
              </Link>
            ) : (
              <Link className="btn ghost" to="/login">
                Sign in
              </Link>
            )}
          </div>
        </header>
        {children}
      </div>
    )
  }

  const link = ({ to, label }: { to: string; label: string }) => (
    <NavLink to={to} end={to === '/overview' || to === '/'}>
      {label}
    </NavLink>
  )

  return (
    <div className="app-frame">
      <aside className="rail">
        <Link to="/" className="brand">
          agent<span>-</span>kernel
        </Link>
        <nav>
          {link({ to: '/overview', label: 'Overview' })}
          {link({ to: '/projects', label: 'Projects' })}
          {link({ to: '/agents', label: 'Agents' })}
          {link({ to: '/runs', label: 'Runs' })}
          {link({ to: '/chat', label: 'Chat' })}
          {link({ to: '/setup', label: 'Executor' })}
          {me?.role === 'admin' && link({ to: '/admin', label: 'Admin' })}
          {me?.role === 'admin' && link({ to: '/settings', label: 'Settings' })}
        </nav>
        <div className="rail-foot">
          {me && (
            <>
              <div className="rail-user">
                {me.username || me.githubLogin || 'user'}
                {me.role ? ` · ${me.role}` : ''}
              </div>
              <button type="button" className="ghost" onClick={() => void logout()}>
                Log out
              </button>
            </>
          )}
        </div>
      </aside>
      <div className="workspace">
        <div className="workspace-main">{children}</div>
      </div>
    </div>
  )
}

function PageHead({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {lead && <p className="lead">{lead}</p>}
    </div>
  )
}

function PublicHome() {
  const { me } = useMe()
  const [cfg, setCfg] = useState<PublicConfig | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    api.publicConfig().then(setCfg).catch((e) => setErr(String(e)))
  }, [])
  return (
    <Shell variant="public">
      <section className="hero-screen">
        <p className="eyebrow">Control plane · BYO executor</p>
        <h1>agent-kernel</h1>
        <p className="tagline">
          Orchestrate catalogs, schedules, and runs. Your DeepSeek Harness codes — this host
          directs.
        </p>
        {err ? <Flash err={err} /> : null}
        <div className="hero-cta">
          {me ? (
            <Link className="btn" to="/overview">
              Enter workspace
            </Link>
          ) : (
            <Link className="btn" to="/login">
              {cfg?.allowBootstrapRegister ? 'Get started' : 'Sign in'}
            </Link>
          )}
          <Link className="btn ghost" to={me ? '/setup' : '/login'}>
            Configure executor
          </Link>
        </div>
        {cfg && (
          <div className="hero-meta">
            <div>
              <strong>Deployment</strong>
              <span>
                {cfg.deploymentMode}
                <em className="meta-hint"> host default — change in Admin</em>
              </span>
            </div>
            <div>
              <strong>Lawpack</strong>
              <span>{cfg.lawpackVersion ?? '—'}</span>
            </div>
            <div>
              <strong>Self-host</strong>
              <span>compose.yml</span>
            </div>
          </div>
        )}
      </section>
    </Shell>
  )
}

function LoginPage() {
  const nav = useNavigate()
  const { refresh } = useMe()
  const [err, setErr] = useState<string | null>(null)
  const [cfg, setCfg] = useState<PublicConfig | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pat, setPat] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.publicConfig().then(setCfg).catch(() => setCfg(null))
  }, [])

  async function afterAuth(setupRequired: boolean) {
    await refresh()
    nav(setupRequired ? '/setup' : '/overview')
  }

  async function goPassword(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      const r = await api.loginPassword(username, password)
      await afterAuth(r.setupRequired)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setBusy(false)
    }
  }

  async function goRegister() {
    setErr(null)
    setBusy(true)
    try {
      const r = await api.register(username, password)
      await afterAuth(r.setupRequired)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setBusy(false)
    }
  }

  async function goGithubPat() {
    setErr(null)
    setBusy(true)
    try {
      const r = await api.loginGithubPat(pat.trim())
      await afterAuth(r.setupRequired)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setBusy(false)
    }
  }

  const [showPat, setShowPat] = useState(false)

  return (
    <div className="login-screen">
      <div className="login-visual">
        <Link to="/" className="brand">
          agent<span>-</span>kernel
        </Link>
        <div>
          <h1>Sign in to direct your agents</h1>
          <p>
            Password account or GitHub identity. This host orchestrates; coding stays on your
            DeepSeek Harness.
          </p>
        </div>
        <p className="muted">{cfg ? `Mode · ${cfg.deploymentMode}` : '…'}</p>
      </div>
      <div className="login-panel">
        <div className="login-card">
          <h2>Welcome back</h2>
          <p className="sub">
            <Link to="/">← Home</Link>
          </p>
          <Flash err={err} />

          <form className="login-form" onSubmit={(e) => void goPassword(e)}>
            <label>
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                minLength={8}
              />
            </label>
            <div className="row">
              <button type="submit" disabled={busy}>
                Sign in
              </button>
              {cfg?.allowBootstrapRegister && (
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() => void goRegister()}
                >
                  Create first admin
                </button>
              )}
            </div>
          </form>

          <div className="login-or" role="separator">
            <span>or</span>
          </div>

          {cfg?.githubOAuthConfigured ? (
            <a className="btn btn-block" href={api.githubOAuthUrl}>
              Continue with GitHub
            </a>
          ) : (
            <p className="muted">GitHub OAuth is not configured on this host.</p>
          )}
          {cfg?.githubOAuthConfigured && cfg.githubSignupMode === 'closed' && (
            <p className="muted">GitHub signup is closed — existing accounts only.</p>
          )}
          {cfg?.githubOAuthConfigured && cfg.githubSignupMode === 'allowlist' && (
            <p className="muted">GitHub signup is allowlist-only on this host.</p>
          )}

          <button
            type="button"
            className="linkish"
            onClick={() => setShowPat((v) => !v)}
          >
            {showPat ? 'Hide personal access token' : 'Use a personal access token instead'}
          </button>

          {showPat && (
            <div className="login-pat">
              <p className="muted">
                Same as GitHub login: proves who you are and unlocks private repo import. Treat it
                like a password.
              </p>
              <label>
                Token
                <input
                  type="password"
                  placeholder="ghp_…"
                  value={pat}
                  onChange={(e) => setPat(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <button
                type="button"
                className="ghost"
                disabled={!pat.trim() || busy}
                onClick={() => void goGithubPat()}
              >
                Sign in with PAT
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SetupWizard() {
  type ConnectMode = 'public_url' | 'ssh_reverse' | 'vpn' | 'same_host'
  const nav = useNavigate()
  const [guide, setGuide] = useState<Awaited<ReturnType<typeof api.connectGuide>> | null>(null)
  const [form, setForm] = useState({
    connectMode: 'same_host' as ConnectMode,
    dshInvokeMode: 'host_http' as 'host_http' | 'cli',
    dshEndpoint: 'http://127.0.0.1:13080',
    dshTrustedHost: '127.0.0.1:13080',
    dshLocalPort: 13080,
    sshTunnelTarget: '',
    dshBasicAuthUser: '',
    dshBasicAuthPassword: '',
    dshCliRoot: '',
    dshHome: '',
    gatewayUrl: '',
    gatewayApiKey: '',
  })
  const [err, setErr] = useState<string | null>(null)
  const [step, setStep] = useState(1)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const [g, ex] = await Promise.all([api.connectGuide(), api.getMyExecutor()])
        setGuide(g)
        setForm((f) => ({
          ...f,
          connectMode: (String(ex.connectMode || g.connectMode) as ConnectMode) || f.connectMode,
          dshInvokeMode: (ex.dshInvokeMode as 'host_http' | 'cli') || f.dshInvokeMode,
          dshEndpoint: String(ex.dshEndpoint ?? f.dshEndpoint ?? ''),
          dshTrustedHost: String(ex.dshTrustedHost ?? f.dshTrustedHost ?? ''),
          dshLocalPort: Number(ex.dshLocalPort ?? g.ssh.localPort ?? 13080),
          sshTunnelTarget: String(ex.sshTunnelTarget ?? g.ssh.sshTarget ?? ''),
          dshBasicAuthUser: String(ex.dshBasicAuthUser ?? ''),
          dshCliRoot: String(ex.dshCliRoot ?? ''),
          dshHome: String(ex.dshHome ?? ''),
          gatewayUrl: String(ex.gatewayUrl ?? ''),
          gatewayApiKey: ex.gatewayApiKey === '***' ? '***' : String(ex.gatewayApiKey ?? ''),
        }))
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  function applyMode(mode: ConnectMode) {
    if (!guide) {
      setForm({ ...form, connectMode: mode })
      return
    }
    if (mode === 'ssh_reverse') {
      setForm({
        ...form,
        connectMode: mode,
        dshEndpoint: guide.ssh.endpoint,
        dshTrustedHost: guide.ssh.trustedHost,
        dshLocalPort: guide.ssh.localPort,
      })
    } else if (mode === 'vpn') {
      setForm({
        ...form,
        connectMode: mode,
        dshEndpoint: guide.vpn.endpointHint,
        dshTrustedHost: guide.vpn.trustedHostHint,
      })
    } else if (mode === 'same_host') {
      setForm({
        ...form,
        connectMode: mode,
        dshEndpoint: `http://127.0.0.1:${form.dshLocalPort}`,
        dshTrustedHost: `127.0.0.1:${form.dshLocalPort}`,
      })
    } else {
      setForm({ ...form, connectMode: mode, dshEndpoint: '', dshTrustedHost: '' })
    }
  }

  async function copySsh() {
    const cmd =
      form.sshTunnelTarget.trim() && guide
        ? `ssh -N -R ${guide.ssh.remotePort}:127.0.0.1:${form.dshLocalPort} ${form.sshTunnelTarget.trim()}`
        : guide?.ssh.command
    if (!cmd) return
    await navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function saveAndTest() {
    setErr(null)
    setBusy(true)
    try {
      await api.putMyExecutor({
        connectMode: form.connectMode,
        dshInvokeMode: form.dshInvokeMode,
        dshEndpoint: form.dshInvokeMode === 'host_http' ? form.dshEndpoint : null,
        dshTrustedHost: form.dshInvokeMode === 'host_http' ? form.dshTrustedHost : null,
        dshLocalPort: form.dshLocalPort,
        sshTunnelTarget: form.sshTunnelTarget.trim() || null,
        dshBasicAuthUser: form.dshBasicAuthUser || null,
        dshBasicAuthPassword: form.dshBasicAuthPassword || null,
        dshCliRoot: form.dshInvokeMode === 'cli' ? form.dshCliRoot || null : null,
        dshHome: form.dshInvokeMode === 'cli' ? form.dshHome || null : null,
        gatewayUrl: form.gatewayUrl || null,
        gatewayApiKey: form.gatewayApiKey || null,
      })
      await api.testDsh()
      nav('/overview')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const modeNotes =
    form.connectMode === 'ssh_reverse'
      ? guide?.ssh.notes
      : form.connectMode === 'vpn'
        ? guide?.vpn.notes
        : form.connectMode === 'same_host'
          ? guide?.sameHost.notes
          : guide?.publicUrl.notes

  const modes =
    guide?.modes ??
    ([
      { id: 'same_host', title: 'Same machine', summary: 'DSH on this host (127.0.0.1).' },
      { id: 'ssh_reverse', title: 'SSH reverse', summary: 'Tunnel from your PC into this kernel.' },
      { id: 'vpn', title: 'VPN', summary: 'Reach DSH over Tailscale / private net.' },
      { id: 'public_url', title: 'Public URL', summary: 'HTTPS endpoint + optional basic auth.' },
    ] as const)

  return (
    <Shell>
      <PageHead
        title="My Executor"
        lead="BYO DeepSeek Harness. The kernel only dials the endpoint you configure here."
      />
      <div className="steps" role="tablist">
        <button
          type="button"
          className={step === 1 ? 'on' : ''}
          onClick={() => setStep(1)}
          role="tab"
          aria-selected={step === 1}
        >
          1 · Connect
        </button>
        <span aria-hidden>·</span>
        <button
          type="button"
          className={step === 2 ? 'on' : ''}
          onClick={() => setStep(2)}
          role="tab"
          aria-selected={step === 2}
        >
          2 · GateWay
        </button>
      </div>
      {form.dshEndpoint || form.dshCliRoot ? (
        <div className="status-strip">
          <strong>Current</strong>
          <span className="stat-mono">
            {form.dshInvokeMode === 'cli'
              ? `cli · ${form.dshCliRoot || '—'}`
              : `${form.connectMode} · ${form.dshEndpoint || '—'}`}
          </span>
        </div>
      ) : null}
      <Flash err={err} />
      {loading ? (
        <p className="loading">Loading executor…</p>
      ) : (
        <>
          {step === 1 && (
            <div className="card">
              <h2>How the kernel reaches your DSH</h2>
              <div className="mode-grid">
                {modes.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`mode-card${form.connectMode === m.id ? ' on' : ''}`}
                    onClick={() => applyMode(m.id as ConnectMode)}
                  >
                    <strong>{m.title}</strong>
                    <span>{m.summary}</span>
                  </button>
                ))}
              </div>
              {modeNotes?.map((n) => (
                <p key={n} className="muted note-line">
                  {n}
                </p>
              ))}

              {form.connectMode === 'ssh_reverse' && guide && (
                <div className="tunnel-box">
                  <label>
                    SSH target (you set this)
                    <input
                      value={form.sshTunnelTarget}
                      onChange={(e) => setForm({ ...form, sshTunnelTarget: e.target.value })}
                      placeholder="user@kernel-host"
                    />
                  </label>
                  <label>
                    Run on your PC
                    <textarea
                      readOnly
                      rows={2}
                      value={
                        form.sshTunnelTarget.trim()
                          ? `ssh -N -R ${guide.ssh.remotePort}:127.0.0.1:${form.dshLocalPort} ${form.sshTunnelTarget.trim()}`
                          : guide.ssh.command
                      }
                    />
                  </label>
                  <button type="button" className="ghost" onClick={() => void copySsh()}>
                    {copied ? 'Copied' : 'Copy SSH command'}
                  </button>
                </div>
              )}

              <h2 className="card-sub">Invoke</h2>
              <div className="mode-grid invoke-grid">
                <button
                  type="button"
                  className={`mode-card${form.dshInvokeMode === 'host_http' ? ' on' : ''}`}
                  onClick={() => setForm({ ...form, dshInvokeMode: 'host_http' })}
                >
                  <strong>HTTP host</strong>
                  <span>Call DSH over the endpoint below (usual BYO path).</span>
                </button>
                <button
                  type="button"
                  className={`mode-card${form.dshInvokeMode === 'cli' ? ' on' : ''}`}
                  onClick={() => setForm({ ...form, dshInvokeMode: 'cli' })}
                >
                  <strong>Local CLI</strong>
                  <span>Same machine only — spawn DSH CLI from a root path.</span>
                </button>
              </div>

              {form.dshInvokeMode === 'host_http' ? (
                <>
                  <label>
                    DSH endpoint
                    <input
                      value={form.dshEndpoint}
                      onChange={(e) => setForm({ ...form, dshEndpoint: e.target.value })}
                    />
                  </label>
                  <label>
                    Trusted Host (= DSH TRUSTED_HOST)
                    <input
                      value={form.dshTrustedHost}
                      onChange={(e) => setForm({ ...form, dshTrustedHost: e.target.value })}
                    />
                  </label>
                  <label>
                    Local DSH port
                    <input
                      type="number"
                      value={form.dshLocalPort}
                      onChange={(e) =>
                        setForm({ ...form, dshLocalPort: Number(e.target.value) || 13080 })
                      }
                    />
                  </label>
                  {form.connectMode === 'public_url' && (
                    <>
                      <label>
                        Basic auth user
                        <input
                          value={form.dshBasicAuthUser}
                          onChange={(e) => setForm({ ...form, dshBasicAuthUser: e.target.value })}
                        />
                      </label>
                      <label>
                        Basic auth password
                        <input
                          type="password"
                          value={form.dshBasicAuthPassword}
                          onChange={(e) =>
                            setForm({ ...form, dshBasicAuthPassword: e.target.value })
                          }
                        />
                      </label>
                    </>
                  )}
                </>
              ) : (
                <>
                  <label>
                    DSH CLI root
                    <input
                      value={form.dshCliRoot}
                      onChange={(e) => setForm({ ...form, dshCliRoot: e.target.value })}
                      placeholder="/path/to/deepseek-harness"
                    />
                  </label>
                  <label>
                    DSH_HOME
                    <input
                      value={form.dshHome}
                      onChange={(e) => setForm({ ...form, dshHome: e.target.value })}
                      placeholder="~/.dsh"
                    />
                  </label>
                </>
              )}
              <div className="row end">
                <button type="button" onClick={() => setStep(2)}>
                  Continue to GateWay
                </button>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="card">
              <h2>GateWay (operator chat)</h2>
              <p className="muted">
                Optional. Without URL + API key, Chat stays unavailable; catalog and runs still work.
              </p>
              <label>
                GateWay URL
                <input
                  value={form.gatewayUrl}
                  onChange={(e) => setForm({ ...form, gatewayUrl: e.target.value })}
                  placeholder="https://…/v1"
                />
              </label>
              <label>
                GateWay API key
                <input
                  type="password"
                  value={form.gatewayApiKey}
                  onChange={(e) => setForm({ ...form, gatewayApiKey: e.target.value })}
                />
              </label>
              <div className="row">
                <button type="button" className="ghost" onClick={() => setStep(1)}>
                  Back
                </button>
                <button type="button" disabled={busy} onClick={() => void saveAndTest()}>
                  {busy ? 'Testing…' : 'Test DSH + Finish'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Shell>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { me, refresh } = useMe()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    void refresh().finally(() => setReady(true))
  }, [refresh])
  if (!ready) {
    return (
      <div className="app-frame">
        <aside className="rail">
          <span className="brand">
            agent<span>-</span>kernel
          </span>
        </aside>
        <div className="workspace">
          <div className="workspace-main">
            <p className="loading">Loading workspace…</p>
          </div>
        </div>
      </div>
    )
  }
  if (!me) return <Navigate to="/login" replace />
  if (me.setupGaps.length > 0) return <Navigate to="/setup" replace />
  return <>{children}</>
}

function RequireAuthRelax({ children }: { children: ReactNode }) {
  const { me, refresh } = useMe()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    void refresh().finally(() => setReady(true))
  }, [refresh])
  if (!ready) {
    return (
      <div className="app-frame">
        <aside className="rail">
          <span className="brand">
            agent<span>-</span>kernel
          </span>
        </aside>
        <div className="workspace">
          <div className="workspace-main">
            <p className="loading">Loading…</p>
          </div>
        </div>
      </div>
    )
  }
  if (!me) return <Navigate to="/login" replace />
  return <>{children}</>
}

function Flash({ err, ok }: { err?: string | null; ok?: string | null }) {
  if (!err && !ok) return null
  return (
    <div className={`flash ${err ? 'flash-err' : 'flash-ok'}`} role="status">
      {err || ok}
    </div>
  )
}

function Overview() {
  const { me } = useMe()
  const [items, setItems] = useState<
    Array<{
      kind: string
      projectId?: string | null
      name?: string
      runId?: string
      assignmentId?: string
      advice?: string[]
      path?: string
    }>
  >([])
  const [projectCount, setProjectCount] = useState(0)
  const [runCount, setRunCount] = useState(0)
  const [executor, setExecutor] = useState<string>('…')
  const [connectMode, setConnectMode] = useState<string>('—')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const [att, projs, runs, ex] = await Promise.all([
          api.attention(),
          api.projects(),
          api.runs(),
          api.getMyExecutor().catch(() => null),
        ])
        setItems(att.items as typeof items)
        setProjectCount(projs.projects.length)
        setRunCount(runs.runs.length)
        if (ex?.connectMode) setConnectMode(String(ex.connectMode))
        if (ex?.dshEndpoint) setExecutor(String(ex.dshEndpoint))
        else if (ex?.dshInvokeMode === 'cli') setExecutor(`cli · ${ex.dshCliRoot ?? '—'}`)
        else setExecutor('not configured')
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <Shell>
      <PageHead
        title={`Hi${me?.username || me?.githubLogin ? `, ${me.username || me.githubLogin}` : ''}`}
        lead="Catalog, schedules, and your BYO executor at a glance."
      />
      <Flash err={err} />
      {loading ? (
        <p className="loading">Loading overview…</p>
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <strong>Projects</strong>
              <span>{projectCount}</span>
            </div>
            <div className="stat">
              <strong>Runs</strong>
              <span>{runCount}</span>
            </div>
            <div className="stat">
              <strong>Attention</strong>
              <span>{items.length}</span>
            </div>
            <div className="stat wide">
              <strong>Executor</strong>
              <span className="stat-mono">
                {connectMode} · {executor}
              </span>
            </div>
          </div>

          <div className="card">
            <h2>Quick actions</h2>
            <div className="row">
              <Link className="btn" to="/projects">
                Projects
              </Link>
              <Link className="btn ghost" to="/agents">
                Agents
              </Link>
              <Link className="btn ghost" to="/setup">
                Executor
              </Link>
              <Link className="btn ghost" to="/runs">
                Runs
              </Link>
            </div>
          </div>

          <div className="card">
            <h2>Needs attention</h2>
            {!items.length ? (
              <div className="empty tight">
                <p>All clear. Register a project or nudge an assignment when you are ready.</p>
              </div>
            ) : (
              <ul className="list">
                {items.map((i, idx) => (
                  <li key={`${i.kind}-${i.runId ?? i.assignmentId ?? i.projectId ?? idx}`}>
                    <div>
                      <div className="meta-row tight">
                        <span className="badge">{i.kind}</span>
                        <strong>{i.name ?? '—'}</strong>
                      </div>
                      {i.advice?.length ? (
                        <div className="muted path-line">{i.advice.join(' · ')}</div>
                      ) : null}
                      {i.path ? <div className="muted path-line">{i.path}</div> : null}
                    </div>
                    <span className="row tight">
                      {i.runId ? (
                        <Link className="btn" to={`/runs/${i.runId}`}>
                          Review run
                        </Link>
                      ) : null}
                      {i.projectId ? (
                        <Link className="btn ghost" to={`/projects/${i.projectId}`}>
                          Project
                        </Link>
                      ) : (
                        <Link className="btn ghost" to="/agents">
                          Agents
                        </Link>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Shell>
  )
}

function ProjectsPage() {
  const { me } = useMe()
  const [projects, setProjects] = useState<Project[]>([])
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [scanPath, setScanPath] = useState('')
  const [ghLogin, setGhLogin] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)

  async function reload() {
    setProjects((await api.projects()).projects)
  }
  useEffect(() => {
    if (me?.githubLogin) setGhLogin(me.githubLogin)
    reload().catch((e) => setErr(String(e)))
  }, [me])

  const filtered = projects.filter((p) => {
    const s = q.trim().toLowerCase()
    if (!s) return true
    return p.name.toLowerCase().includes(s) || p.localPath.toLowerCase().includes(s)
  })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    try {
      await api.registerProject({ name, path })
      setName('')
      setPath('')
      setShowAdd(false)
      setOk(`Registered ${name}`)
      await reload()
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex))
    }
  }

  async function onScanLocal() {
    setErr(null)
    setBusy('scan')
    try {
      const r = await api.scanLocal(scanPath, true)
      setOk(
        `Scan done: +${r.registered.length} registered, ${r.skipped.length} skipped, ${r.analyzed.length} analyzed`,
      )
      await reload()
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setBusy(null)
    }
  }

  async function onImportGh(visibility: 'all' | 'public') {
    setErr(null)
    setBusy(visibility)
    try {
      const r = await api.importGithub({
        visibility,
        login: ghLogin || undefined,
        clone: true,
        analyze: true,
      })
      setOk(
        `GitHub ${visibility}: ${r.repoCount} listed, +${r.registered.length} registered, ${r.analyzed.length} analyzed`,
      )
      await reload()
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Shell>
      <PageHead
        title="Projects"
        lead="Your catalog. Paths must be visible to the API container (mounted workspaces)."
      />
      <Flash err={err} ok={ok || null} />

      <div className="toolbar">
        <input
          className="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter projects…"
        />
        <button type="button" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? 'Close' : 'Register path'}
        </button>
        <button type="button" className="ghost" onClick={() => setShowImport((v) => !v)}>
          {showImport ? 'Close import' : 'Import'}
        </button>
      </div>

      {showAdd && (
        <form className="card" onSubmit={(e) => void onSubmit(e)}>
          <h2>Register path</h2>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Absolute path (inside container / host mount)
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/workspaces/my-repo"
              required
            />
          </label>
          <button type="submit">Register</button>
        </form>
      )}

      {showImport && (
        <div className="card">
          <h2>Import catalog</h2>
          <label>
            Local scan root
            <input
              value={scanPath}
              onChange={(e) => setScanPath(e.target.value)}
              placeholder="/workspaces"
            />
          </label>
          <button
            type="button"
            disabled={!!busy || !scanPath.trim()}
            onClick={() => void onScanLocal()}
          >
            {busy === 'scan' ? 'Scanning…' : 'Scan local + analyze'}
          </button>
          <label>
            GitHub login
            <input
              value={ghLogin}
              onChange={(e) => setGhLogin(e.target.value)}
              placeholder="your-github-user"
            />
          </label>
          <div className="row">
            <button type="button" disabled={!!busy} onClick={() => void onImportGh('all')}>
              {busy === 'all' ? 'Importing…' : 'Import all / private'}
            </button>
            <button type="button" className="ghost" disabled={!!busy} onClick={() => void onImportGh('public')}>
              {busy === 'public' ? 'Importing…' : 'Public only'}
            </button>
          </div>
          <p className="muted">Private import needs GitHub OAuth or PAT login.</p>
        </div>
      )}

      {!filtered.length ? (
        <div className="empty">
          <p>{projects.length ? 'No matches.' : 'No projects yet.'}</p>
          <div className="row center">
            <button type="button" onClick={() => setShowAdd(true)}>
              Register path
            </button>
            <button type="button" className="ghost" onClick={() => setShowImport(true)}>
              Import
            </button>
          </div>
        </div>
      ) : (
        <ul className="list">
          {filtered.map((p) => (
            <li key={p.id}>
              <div>
                <Link to={`/projects/${p.id}`}>
                  {p.name} <span className="badge">{p.status}</span>
                </Link>
                <div className="muted path-line">{p.localPath}</div>
              </div>
              <Link className="btn ghost" to={`/projects/${p.id}`}>
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  )
}

function fmtWhen(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function OutcomeBadge({ outcome }: { outcome?: string | null }) {
  const o = (outcome ?? 'idle').toLowerCase()
  return <span className={`badge outcome-${o}`}>{outcome ?? 'idle'}</span>
}

function ProjectDetail() {
  const { id } = useParams()
  const [project, setProject] = useState<Project | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [profileId, setProfileId] = useState('tracking-cycle')
  const [scheduleMode, setScheduleMode] = useState('manual')
  const [cronExpr, setCronExpr] = useState('0 3 * * *')
  const [reviewMode, setReviewMode] = useState('human')
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [preset, setPreset] = useState('tracking')
  const [briefJson, setBriefJson] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function reload() {
    if (!id) return
    const [p, a, pr, r] = await Promise.all([
      api.project(id),
      api.assignments(id),
      api.profiles(),
      api.runs(id),
    ])
    setProject(p.project)
    setAssignments(a.assignments)
    setProfiles(pr.profiles)
    setRuns(r.runs)
    if (pr.profiles[0] && profileId === 'tracking-cycle') {
      setProfileId(pr.profiles[0].id)
    }
  }
  useEffect(() => {
    setLoading(true)
    reload()
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [id])
  if (!id) return null

  const meta = project?.meta ?? {}
  const facts = (meta.facts as Record<string, unknown> | undefined) ?? undefined
  const advice = (meta.advice as string[] | undefined) ?? []
  const hygiene = facts?.hygiene as { hasReadme?: boolean } | undefined

  function latestFor(assignmentId: string) {
    return runs.find((r) => r.assignment_id === assignmentId)
  }

  return (
    <Shell>
      <p className="crumb">
        <Link to="/projects">Projects</Link>
        <span>/</span>
        <span>{project?.name ?? '…'}</span>
      </p>
      <PageHead title={project?.name ?? 'Project'} lead={project?.localPath ?? undefined} />
      <div className="meta-row">
        {project && <span className="badge">{project.status}</span>}
        {project?.lawpackVersion && (
          <span className="badge">lawpack {project.lawpackVersion}</span>
        )}
        {project?.gitRemote && <span className="badge">git</span>}
      </div>
      <Flash err={err} ok={ok} />
      {loading ? (
        <p className="loading">Loading project…</p>
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <strong>Assignments</strong>
              <span>{assignments.length}</span>
            </div>
            <div className="stat">
              <strong>Runs</strong>
              <span>{runs.length}</span>
            </div>
            <div className="stat">
              <strong>Active</strong>
              <span>
                {assignments.filter((a) => !a.paused && latestFor(a.id)?.outcome === 'running').length}
              </span>
            </div>
            <div className="stat wide">
              <strong>Last analyzed</strong>
              <span className="stat-mono">
                {String(meta.factsAt ?? facts?.analyzedAt ?? '—')}
              </span>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Catalog metadata</h2>
              <button
                type="button"
                className="ghost"
                disabled={!!busy}
                onClick={() => {
                  setBusy('analyze')
                  api
                    .analyze(id)
                    .then(() => {
                      setOk('Analyze refreshed')
                      return reload()
                    })
                    .catch((e) => setErr(String(e)))
                    .finally(() => setBusy(null))
                }}
              >
                {busy === 'analyze' ? '…' : 'Refresh analyze'}
              </button>
            </div>
            {!facts && !advice.length ? (
              <div className="empty tight">
                No analyzer facts yet. Run analyze (or import with analyze).
              </div>
            ) : (
              <div className="meta-grid">
                {facts?.packageManager != null && (
                  <div>
                    <strong>Package</strong>
                    <span>{String(facts.packageManager)}</span>
                  </div>
                )}
                {Boolean(meta.gateCommand || facts?.gateCommand) && (
                  <div>
                    <strong>Gate</strong>
                    <span className="stat-mono">
                      {String(meta.gateCommand ?? facts?.gateCommand)}
                    </span>
                  </div>
                )}
                {facts?.daysSinceTouch != null && (
                  <div>
                    <strong>Days since touch</strong>
                    <span>{String(facts.daysSinceTouch)}</span>
                  </div>
                )}
                {facts?.fileCountApprox != null && (
                  <div>
                    <strong>Files ~</strong>
                    <span>{String(facts.fileCountApprox)}</span>
                  </div>
                )}
                {hygiene && (
                  <div>
                    <strong>README</strong>
                    <span>{hygiene.hasReadme ? 'yes' : 'missing'}</span>
                  </div>
                )}
                {project?.gitRemote && (
                  <div className="span-2">
                    <strong>Remote</strong>
                    <span className="stat-mono">{project.gitRemote}</span>
                  </div>
                )}
              </div>
            )}
            {advice.length > 0 && (
              <ul className="advice-list">
                {advice.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h2>Initialize lawpack</h2>
            <p className="muted">
              Sniff detects layout; Init plants tracking files for the chosen preset.
            </p>
            <div className="row">
              <button
                type="button"
                className="ghost"
                disabled={!!busy}
                onClick={() => {
                  setBusy('sniff')
                  api
                    .sniff(id)
                    .then(() => {
                      setOk('Sniff complete')
                      return reload()
                    })
                    .catch((e) => setErr(String(e)))
                    .finally(() => setBusy(null))
                }}
              >
                {busy === 'sniff' ? '…' : 'Sniff'}
              </button>
              <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                <option value="clean">clean</option>
                <option value="tracking">tracking</option>
                <option value="offline">offline</option>
              </select>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => {
                  setBusy('init')
                  api
                    .initApply(id, { presetId: preset })
                    .then(() => {
                      setOk(`Init applied (${preset})`)
                      return reload()
                    })
                    .catch((e) => setErr(String(e)))
                    .finally(() => setBusy(null))
                }}
              >
                {busy === 'init' ? '…' : 'Init apply'}
              </button>
            </div>
          </div>

          <div className="card">
            <h2>Agents on this project</h2>
            <p className="muted">
              Assignments bind a profile to this repo. Nudge starts/continues a run on your BYO
              executor.
            </p>
            {!assignments.length ? (
              <div className="empty tight">No assignments yet — add one below.</div>
            ) : (
              <ul className="list">
                {assignments.map((a) => {
                  const last = latestFor(a.id)
                  const label =
                    profiles.find((p) => p.id === a.profile_id)?.label ?? a.profile_id
                  return (
                    <li key={a.id}>
                      <div>
                        <strong>{label}</strong>
                        <div className="meta-row tight">
                          <span className="badge">{a.schedule_mode}</span>
                          {a.cron_expr ? <span className="badge">{a.cron_expr}</span> : null}
                          <span className="badge">{a.review_mode}</span>
                          {a.paused ? (
                            <span className="badge outcome-paused">paused</span>
                          ) : last ? (
                            <OutcomeBadge outcome={last.outcome ?? 'running'} />
                          ) : (
                            <span className="badge">idle</span>
                          )}
                        </div>
                        {last && (
                          <div className="muted path-line">
                            last run {fmtWhen(last.started_at)} ·{' '}
                            <Link to={`/runs/${last.id}`}>open run</Link>
                          </div>
                        )}
                      </div>
                      <span className="row tight">
                        <button
                          type="button"
                          disabled={!!busy || !!a.paused}
                          onClick={() => {
                            setBusy(a.id)
                            api
                              .nudge(a.id)
                              .then(() => {
                                setOk('Nudge sent to executor')
                                return reload()
                              })
                              .catch((e) => setErr(String(e)))
                              .finally(() => setBusy(null))
                          }}
                        >
                          {busy === a.id ? '…' : 'Nudge'}
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          disabled={!!busy}
                          onClick={() => {
                            setBusy(`p-${a.id}`)
                            api
                              .patchAssignment(a.id, { paused: !a.paused })
                              .then(() => {
                                setOk(a.paused ? 'Resumed' : 'Paused')
                                return reload()
                              })
                              .catch((e) => setErr(String(e)))
                              .finally(() => setBusy(null))
                          }}
                        >
                          {a.paused ? 'Resume' : 'Pause'}
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          disabled={!!busy}
                          onClick={() => {
                            setBusy(`b-${a.id}`)
                            api
                              .brief(a.id)
                              .then((b) => {
                                setBriefJson(JSON.stringify(b, null, 2))
                                setOk('Brief ready')
                              })
                              .catch((e) => setErr(String(e)))
                              .finally(() => setBusy(null))
                          }}
                        >
                          Brief
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          disabled={!!busy}
                          onClick={() => {
                            if (!confirm('Delete this assignment?')) return
                            setBusy(`d-${a.id}`)
                            api
                              .deleteAssignment(a.id)
                              .then(() => {
                                setOk('Assignment deleted')
                                return reload()
                              })
                              .catch((e) => setErr(String(e)))
                              .finally(() => setBusy(null))
                          }}
                        >
                          Delete
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="add-assign">
              <label>
                Profile
                <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                  {!profiles.length && <option value="tracking-cycle">tracking-cycle</option>}
                </select>
              </label>
              <label>
                Schedule
                <select value={scheduleMode} onChange={(e) => setScheduleMode(e.target.value)}>
                  <option value="manual">manual</option>
                  <option value="infinite">infinite</option>
                  <option value="cron">cron</option>
                  <option value="once">once</option>
                  <option value="on_event">on_event</option>
                </select>
              </label>
              {scheduleMode === 'cron' && (
                <label>
                  Cron expr
                  <input value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} />
                </label>
              )}
              <label>
                Review
                <select value={reviewMode} onChange={(e) => setReviewMode(e.target.value)}>
                  <option value="human">human — start now</option>
                  <option value="llm_auto">llm_auto — start now (no human gate)</option>
                  <option value="llm_propose">llm_propose — queue until Approve</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() =>
                  api
                    .createAssignment(id, {
                      profileId,
                      scheduleMode,
                      reviewMode,
                      cronExpr: scheduleMode === 'cron' ? cronExpr : null,
                    })
                    .then(() => {
                      setOk('Assignment created')
                      return reload()
                    })
                    .catch((e) => setErr(String(e)))
                }
              >
                Add assignment
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Run history</h2>
              <Link className="btn ghost" to="/runs">
                All runs
              </Link>
            </div>
            {!runs.length ? (
              <div className="empty tight">No runs for this project yet. Nudge an assignment.</div>
            ) : (
              <ul className="list">
                {runs.slice(0, 20).map((r) => (
                  <li key={r.id}>
                    <div>
                      <div className="meta-row tight">
                        <OutcomeBadge outcome={r.outcome} />
                        <span className="muted">{fmtWhen(r.started_at)}</span>
                      </div>
                      <div className="muted path-line">
                        session {r.executor_session_id ?? '—'}
                        {r.brief_hash ? ` · brief ${r.brief_hash}` : ''}
                      </div>
                    </div>
                    <Link className="btn ghost" to={`/runs/${r.id}`}>
                      Detail
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {briefJson && (
            <div className="card">
              <div className="card-head">
                <h2>Session brief preview</h2>
                <button type="button" className="ghost" onClick={() => setBriefJson(null)}>
                  Close
                </button>
              </div>
              <textarea className="mono" rows={14} readOnly value={briefJson} />
            </div>
          )}
        </>
      )}
    </Shell>
  )
}

function AgentsPage() {
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof api.agentActivity>>['items']
  >([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [roles, setRoles] = useState<string[]>([])
  const [overlays, setOverlays] = useState<string[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [tab, setTab] = useState<'activity' | 'profiles'>('activity')
  const [busy, setBusy] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  // New assignment form
  const [scope, setScope] = useState<'project' | 'global'>('project')
  const [projectId, setProjectId] = useState('')
  const [profileId, setProfileId] = useState('tracking-cycle')
  const [scheduleMode, setScheduleMode] = useState('manual')
  const [cronExpr, setCronExpr] = useState('0 3 * * *')
  const [reviewMode, setReviewMode] = useState('human')
  const [fanOutMode, setFanOutMode] = useState<'all_initialized' | 'allow_list'>('all_initialized')
  const [fanOutIds, setFanOutIds] = useState('')

  // Edit assignment form
  const [editSchedule, setEditSchedule] = useState('manual')
  const [editCron, setEditCron] = useState('')
  const [editReview, setEditReview] = useState('human')
  const [editProfile, setEditProfile] = useState('')

  // New profile form
  const [newProfId, setNewProfId] = useState('')
  const [newProfLabel, setNewProfLabel] = useState('')
  const [newProfRole, setNewProfRole] = useState('roles/followup.md')
  const [newProfOverlay, setNewProfOverlay] = useState('')
  const [editProfId, setEditProfId] = useState<string | null>(null)
  const [editProfLabel, setEditProfLabel] = useState('')
  const [editProfRole, setEditProfRole] = useState('')
  const [editProfOverlay, setEditProfOverlay] = useState('')

  async function reload() {
    const [act, pr, pj] = await Promise.all([
      api.agentActivity(),
      api.profiles(),
      api.projects(),
    ])
    setItems(act.items)
    setProfiles(pr.profiles)
    setRoles(pr.roles ?? [])
    setOverlays(pr.overlays ?? [])
    setProjects(pj.projects)
    if (pr.profiles[0] && !pr.profiles.some((p) => p.id === profileId)) {
      setProfileId(pr.profiles[0].id)
    }
    if (pj.projects[0] && !projectId) setProjectId(pj.projects[0].id)
  }

  useEffect(() => {
    reload()
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const filtered = items.filter((i) => {
    const s = filter.trim().toLowerCase()
    if (!s) return true
    return (
      i.projectName.toLowerCase().includes(s) ||
      i.profileLabel.toLowerCase().includes(s) ||
      i.status.toLowerCase().includes(s) ||
      i.scheduleMode.toLowerCase().includes(s)
    )
  })

  const running = items.filter((i) => i.status === 'running').length
  const paused = items.filter((i) => i.paused).length

  function startEdit(i: (typeof items)[0]) {
    setEditingId(i.assignmentId)
    setEditSchedule(i.scheduleMode)
    setEditCron(i.cronExpr ?? '')
    setEditReview(i.reviewMode)
    setEditProfile(i.profileId)
  }

  async function saveEdit() {
    if (!editingId) return
    setBusy(`e-${editingId}`)
    setErr(null)
    try {
      await api.patchAssignment(editingId, {
        scheduleMode: editSchedule,
        cronExpr: editSchedule === 'cron' ? editCron : null,
        reviewMode: editReview,
        profileId: editProfile,
      })
      setOk('Assignment updated')
      setEditingId(null)
      await reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function createAssign() {
    setBusy('create')
    setErr(null)
    try {
      if (scope === 'project') {
        if (!projectId) throw new Error('Pick a project')
        await api.createAssignment(projectId, {
          profileId,
          scheduleMode,
          reviewMode,
          cronExpr: scheduleMode === 'cron' ? cronExpr : null,
        })
      } else {
        const fanOut =
          fanOutMode === 'allow_list'
            ? {
                mode: 'allow_list' as const,
                projectIds: fanOutIds
                  .split(/[\n,]+/)
                  .map((x) => x.trim())
                  .filter(Boolean),
              }
            : { mode: 'all_initialized' as const }
        if (fanOut.mode === 'allow_list' && !fanOut.projectIds.length) {
          throw new Error('allow_list needs at least one project id')
        }
        await api.createGlobalAssignment({
          profileId,
          scheduleMode,
          reviewMode,
          cronExpr: scheduleMode === 'cron' ? cronExpr : null,
          fanOut,
        })
      }
      setOk('Assignment created')
      await reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Shell>
      <PageHead
        title="Agents"
        lead="Create and manage assignments (profile × project/global × schedule) and the profile library."
      />
      <Flash err={err} ok={ok} />
      <div className="steps" role="tablist">
        <button
          type="button"
          className={tab === 'activity' ? 'on' : ''}
          onClick={() => setTab('activity')}
        >
          Assignments
        </button>
        <span aria-hidden>·</span>
        <button
          type="button"
          className={tab === 'profiles' ? 'on' : ''}
          onClick={() => setTab('profiles')}
        >
          Profiles
        </button>
      </div>

      {loading ? (
        <p className="loading">Loading agents…</p>
      ) : tab === 'activity' ? (
        <>
          <div className="stats">
            <div className="stat">
              <strong>Assignments</strong>
              <span>{items.length}</span>
            </div>
            <div className="stat">
              <strong>Running</strong>
              <span>{running}</span>
            </div>
            <div className="stat">
              <strong>Paused</strong>
              <span>{paused}</span>
            </div>
            <div className="stat">
              <strong>Profiles</strong>
              <span>{profiles.length}</span>
            </div>
          </div>

          <div className="card">
            <h2>New assignment</h2>
            <div className="add-assign">
              <label>
                Scope
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as 'project' | 'global')}
                >
                  <option value="project">One project</option>
                  <option value="global">Global (fan-out)</option>
                </select>
              </label>
              {scope === 'project' ? (
                <label>
                  Project
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                    {!projects.length && <option value="">No projects</option>}
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.status})
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label>
                    Fan-out
                    <select
                      value={fanOutMode}
                      onChange={(e) =>
                        setFanOutMode(e.target.value as 'all_initialized' | 'allow_list')
                      }
                    >
                      <option value="all_initialized">All initialized projects</option>
                      <option value="allow_list">Allow-list project ids</option>
                    </select>
                  </label>
                  {fanOutMode === 'allow_list' && (
                    <label className="field">
                      Project ids
                      <textarea
                        rows={3}
                        value={fanOutIds}
                        onChange={(e) => setFanOutIds(e.target.value)}
                        placeholder="one id per line"
                      />
                    </label>
                  )}
                </>
              )}
              <label>
                Profile
                <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Schedule
                <select value={scheduleMode} onChange={(e) => setScheduleMode(e.target.value)}>
                  <option value="manual">manual</option>
                  <option value="infinite">infinite</option>
                  <option value="cron">cron</option>
                  <option value="once">once</option>
                  <option value="on_event">on_event</option>
                </select>
              </label>
              {scheduleMode === 'cron' && (
                <label>
                  Cron
                  <input value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} />
                </label>
              )}
              <label>
                Review
                <select value={reviewMode} onChange={(e) => setReviewMode(e.target.value)}>
                  <option value="human">human — start now</option>
                  <option value="llm_auto">llm_auto — start now (no human gate)</option>
                  <option value="llm_propose">llm_propose — queue until Approve</option>
                </select>
              </label>
              <button type="button" disabled={!!busy} onClick={() => void createAssign()}>
                {busy === 'create' ? '…' : 'Create assignment'}
              </button>
            </div>
          </div>

          <div className="toolbar">
            <input
              className="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by project, profile, status…"
            />
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setLoading(true)
                reload()
                  .catch((e) => setErr(String(e)))
                  .finally(() => setLoading(false))
              }}
            >
              Refresh
            </button>
          </div>

          {!filtered.length ? (
            <div className="empty">
              <p>{items.length ? 'No matches.' : 'No assignments yet — create one above.'}</p>
            </div>
          ) : (
            <ul className="list activity-list">
              {filtered.map((i) => (
                <li key={i.assignmentId}>
                  <div>
                    <div className="activity-title">
                      <strong>{i.profileLabel}</strong>
                      <span className="muted">on</span>
                      {i.projectId ? (
                        <Link to={`/projects/${i.projectId}`}>{i.projectName}</Link>
                      ) : (
                        <span>{i.projectName}</span>
                      )}
                    </div>
                    <div className="meta-row tight">
                      <OutcomeBadge outcome={i.status} />
                      <span className="badge">{i.scheduleMode}</span>
                      {i.cronExpr ? <span className="badge">{i.cronExpr}</span> : null}
                      <span className="badge">{i.reviewMode}</span>
                    </div>
                    <div className="muted path-line">
                      {i.projectPath ?? 'global fan-out'}
                      {i.latestRun
                        ? ` · last ${fmtWhen(i.latestRun.startedAt)}`
                        : ' · never run'}
                    </div>
                    {editingId === i.assignmentId && (
                      <div className="add-assign" style={{ marginTop: '0.75rem' }}>
                        <label>
                          Profile
                          <select
                            value={editProfile}
                            onChange={(e) => setEditProfile(e.target.value)}
                          >
                            {profiles.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Schedule
                          <select
                            value={editSchedule}
                            onChange={(e) => setEditSchedule(e.target.value)}
                          >
                            <option value="manual">manual</option>
                            <option value="infinite">infinite</option>
                            <option value="cron">cron</option>
                            <option value="once">once</option>
                            <option value="on_event">on_event</option>
                          </select>
                        </label>
                        {editSchedule === 'cron' && (
                          <label>
                            Cron
                            <input
                              value={editCron}
                              onChange={(e) => setEditCron(e.target.value)}
                            />
                          </label>
                        )}
                        <label>
                          Review
                          <select
                            value={editReview}
                            onChange={(e) => setEditReview(e.target.value)}
                          >
                            <option value="human">human</option>
                            <option value="llm_propose">llm_propose</option>
                            <option value="llm_auto">llm_auto</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => void saveEdit()}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="row tight">
                    {i.latestRun && (
                      <Link className="btn ghost" to={`/runs/${i.latestRun.id}`}>
                        Last run
                      </Link>
                    )}
                    {i.projectId && (
                      <Link className="btn ghost" to={`/projects/${i.projectId}`}>
                        Project
                      </Link>
                    )}
                    <button
                      type="button"
                      className="ghost"
                      disabled={!!busy}
                      onClick={() => startEdit(i)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={!!busy}
                      onClick={() => {
                        setBusy(i.assignmentId)
                        api
                          .patchAssignment(i.assignmentId, { paused: !i.paused })
                          .then(() => {
                            setOk(i.paused ? 'Resumed' : 'Paused')
                            return reload()
                          })
                          .catch((e) => setErr(String(e)))
                          .finally(() => setBusy(null))
                      }}
                    >
                      {i.paused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      type="button"
                      disabled={!!busy || i.paused}
                      onClick={() => {
                        setBusy(`n-${i.assignmentId}`)
                        api
                          .nudge(i.assignmentId)
                          .then(() => {
                            setOk('Nudge sent')
                            return reload()
                          })
                          .catch((e) => setErr(String(e)))
                          .finally(() => setBusy(null))
                      }}
                    >
                      {busy === `n-${i.assignmentId}` ? '…' : 'Nudge'}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={!!busy}
                      onClick={() => {
                        if (!confirm('Delete this assignment?')) return
                        setBusy(`d-${i.assignmentId}`)
                        api
                          .deleteAssignment(i.assignmentId)
                          .then(() => {
                            setOk('Assignment deleted')
                            return reload()
                          })
                          .catch((e) => setErr(String(e)))
                          .finally(() => setBusy(null))
                      }}
                    >
                      Delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="card">
            <h2>New profile</h2>
            <p className="muted">
              Profiles point at lawpack role files. Behavior text stays in MD — this is the library
              entry you assign to projects.
            </p>
            <div className="add-assign">
              <label>
                Id
                <input
                  value={newProfId}
                  onChange={(e) => setNewProfId(e.target.value)}
                  placeholder="my-cycle"
                />
              </label>
              <label>
                Label
                <input
                  value={newProfLabel}
                  onChange={(e) => setNewProfLabel(e.target.value)}
                  placeholder="My cycle"
                />
              </label>
              <label>
                Role file
                <select value={newProfRole} onChange={(e) => setNewProfRole(e.target.value)}>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                  {!roles.length && <option value="roles/followup.md">roles/followup.md</option>}
                </select>
              </label>
              <label>
                Overlay
                <select
                  value={newProfOverlay}
                  onChange={(e) => setNewProfOverlay(e.target.value)}
                >
                  <option value="">(none)</option>
                  {overlays.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => {
                  setBusy('prof-create')
                  setErr(null)
                  api
                    .createProfile({
                      id: newProfId,
                      label: newProfLabel,
                      rolePath: newProfRole,
                      overlay: newProfOverlay || null,
                      defaultScheduleMode: 'manual',
                      defaultReviewMode: 'human',
                    })
                    .then(() => {
                      setOk('Profile created')
                      setNewProfId('')
                      setNewProfLabel('')
                      return reload()
                    })
                    .catch((e) => setErr(String(e)))
                    .finally(() => setBusy(null))
                }}
              >
                {busy === 'prof-create' ? '…' : 'Create profile'}
              </button>
            </div>
          </div>

          {!profiles.length ? (
            <div className="empty">
              <p>No profiles yet.</p>
            </div>
          ) : (
            <ul className="list">
              {profiles.map((p) => {
                const count = items.filter((i) => i.profileId === p.id).length
                const editing = editProfId === p.id
                return (
                  <li key={p.id}>
                    <div>
                      <strong>{p.label}</strong>
                      <div className="meta-row tight">
                        <span className="badge">{p.id}</span>
                        <span className="badge">{p.role_path}</span>
                        {p.lawpack_profile_overlay ? (
                          <span className="badge">overlay {p.lawpack_profile_overlay}</span>
                        ) : null}
                        <span className="badge">{count} assigned</span>
                      </div>
                      {editing && (
                        <div className="add-assign" style={{ marginTop: '0.75rem' }}>
                          <label>
                            Label
                            <input
                              value={editProfLabel}
                              onChange={(e) => setEditProfLabel(e.target.value)}
                            />
                          </label>
                          <label>
                            Role
                            <select
                              value={editProfRole}
                              onChange={(e) => setEditProfRole(e.target.value)}
                            >
                              {roles.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Overlay
                            <select
                              value={editProfOverlay}
                              onChange={(e) => setEditProfOverlay(e.target.value)}
                            >
                              <option value="">(none)</option>
                              {overlays.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() => {
                              setBusy(`pe-${p.id}`)
                              api
                                .updateProfile(p.id, {
                                  label: editProfLabel,
                                  rolePath: editProfRole,
                                  overlay: editProfOverlay || null,
                                })
                                .then(() => {
                                  setOk('Profile updated')
                                  setEditProfId(null)
                                  return reload()
                                })
                                .catch((e) => setErr(String(e)))
                                .finally(() => setBusy(null))
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => setEditProfId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                    <span className="row tight">
                      <button
                        type="button"
                        className="ghost"
                        disabled={!!busy}
                        onClick={() => {
                          setEditProfId(p.id)
                          setEditProfLabel(p.label)
                          setEditProfRole(p.role_path)
                          setEditProfOverlay(p.lawpack_profile_overlay ?? '')
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={!!busy || count > 0}
                        title={count > 0 ? 'Remove assignments first' : 'Delete profile'}
                        onClick={() => {
                          if (!confirm(`Delete profile ${p.id}?`)) return
                          setBusy(`pd-${p.id}`)
                          api
                            .deleteProfile(p.id)
                            .then(() => {
                              setOk('Profile deleted')
                              return reload()
                            })
                            .catch((e) => setErr(String(e)))
                            .finally(() => setBusy(null))
                        }}
                      >
                        Delete
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </Shell>
  )
}

function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [projects, setProjects] = useState<Map<string, string>>(new Map())
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  async function reload() {
    setLoading(true)
    try {
      const [r, p] = await Promise.all([api.runs(), api.projects()])
      setRuns(r.runs)
      setProjects(new Map(p.projects.map((x) => [x.id, x.name])))
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const filtered = runs.filter((r) => {
    const s = filter.trim().toLowerCase()
    if (!s) return true
    const outcome = (r.outcome ?? 'running').toLowerCase()
    const name = (projects.get(r.project_id) ?? '').toLowerCase()
    return (
      outcome.includes(s) ||
      name.includes(s) ||
      r.assignment_id.toLowerCase().includes(s) ||
      r.project_id.toLowerCase().includes(s) ||
      String(r.executor_session_id ?? '')
        .toLowerCase()
        .includes(s)
    )
  })

  return (
    <Shell>
      <PageHead title="Runs" lead="Executor sessions started by nudge or scheduler." />
      <Flash err={err} />
      <div className="toolbar">
        <input
          className="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by project, outcome, session…"
        />
        <button type="button" className="ghost" disabled={loading} onClick={() => void reload()}>
          {loading ? '…' : 'Refresh'}
        </button>
      </div>
      {loading && !runs.length ? (
        <p className="loading">Loading runs…</p>
      ) : !filtered.length ? (
        <div className="empty">
          <p>{runs.length ? 'No matches.' : 'No runs yet.'}</p>
          {!runs.length && (
            <div className="row center">
              <Link className="btn" to="/projects">
                Open a project
              </Link>
            </div>
          )}
        </div>
      ) : (
        <ul className="list">
          {filtered.map((r) => (
            <li key={r.id}>
              <div>
                <div className="meta-row">
                  <OutcomeBadge outcome={r.outcome} />
                  <Link to={`/projects/${r.project_id}`}>
                    {projects.get(r.project_id) ?? r.project_id.slice(0, 8)}
                  </Link>
                  <span className="muted">{fmtWhen(r.started_at)}</span>
                  {r.ended_at ? <span className="muted">→ {fmtWhen(r.ended_at)}</span> : null}
                </div>
                <div className="muted path-line">
                  session {r.executor_session_id ?? '—'}
                  {r.brief_hash ? ` · brief ${r.brief_hash}` : ''}
                </div>
              </div>
              <Link className="btn ghost" to={`/runs/${r.id}`}>
                Detail
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  )
}

function RunDetailPage() {
  const { runId } = useParams()
  const [run, setRun] = useState<Awaited<ReturnType<typeof api.run>>['run'] | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'transcript' | 'files' | 'brief'>('transcript')
  const [tx, setTx] = useState<Awaited<ReturnType<typeof api.runTranscript>> | null>(null)
  const [txBusy, setTxBusy] = useState(false)

  async function loadTranscript() {
    if (!runId) return
    setTxBusy(true)
    setErr(null)
    try {
      const t = await api.runTranscript(runId)
      setTx(t)
      setRun(t.run)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setTx(null)
    } finally {
      setTxBusy(false)
    }
  }

  useEffect(() => {
    if (!runId) return
    setLoading(true)
    api
      .run(runId)
      .then(async (r) => {
        setRun(r.run)
        try {
          const p = await api.project(r.run.project_id)
          setProjectName(p.project.name)
        } catch {
          setProjectName(null)
        }
        if (r.run.outcome !== 'awaiting_review' && r.run.outcome !== 'rejected') {
          await loadTranscript()
        } else {
          setTx(null)
        }
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [runId])

  let briefPretty = ''
  if (run?.brief_json) {
    try {
      briefPretty = JSON.stringify(JSON.parse(run.brief_json), null, 2)
    } catch {
      briefPretty = run.brief_json
    }
  }

  return (
    <Shell>
      <p className="crumb">
        <Link to="/runs">Runs</Link>
        <span>/</span>
        <span>{runId?.slice(0, 8) ?? '…'}</span>
      </p>
      <PageHead
        title={tx?.session.title || 'Run detail'}
        lead="Executor session via ExecutorPort — transcript is live from your configured coding host."
      />
      <Flash err={err} />
      {loading ? (
        <p className="loading">Loading run…</p>
      ) : !run ? (
        <div className="empty">Run not found.</div>
      ) : (
        <>
          {run.outcome === 'awaiting_review' && (
            <div className="card">
              <h2>Awaiting approval</h2>
              <p className="muted">
                reviewMode=llm_propose — executor has not been started. Approve to call ExecutorPort,
                or reject.
              </p>
              {(() => {
                try {
                  const b = run.brief_json ? JSON.parse(run.brief_json) : null
                  const prop = b?.reviewProposal
                  return prop ? (
                    <pre className="mono" style={{ whiteSpace: 'pre-wrap', maxHeight: 220 }}>
                      {String(prop)}
                    </pre>
                  ) : null
                } catch {
                  return null
                }
              })()}
              <div className="row">
                <button
                  type="button"
                  disabled={txBusy}
                  onClick={() => {
                    setTxBusy(true)
                    setErr(null)
                    api
                      .approveRun(run.id)
                      .then((r) => {
                        setRun(r.run)
                        return loadTranscript()
                      })
                      .catch((e) => setErr(String(e)))
                      .finally(() => setTxBusy(false))
                  }}
                >
                  Approve &amp; start
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={txBusy}
                  onClick={() => {
                    setTxBusy(true)
                    api
                      .rejectRun(run.id)
                      .then((r) => setRun(r.run))
                      .catch((e) => setErr(String(e)))
                      .finally(() => setTxBusy(false))
                  }}
                >
                  Reject
                </button>
              </div>
            </div>
          )}

          <div className="stats">
            <div className="stat">
              <strong>Outcome</strong>
              <span>
                <OutcomeBadge
                  outcome={
                    tx?.session.running ? 'running' : (run.outcome ?? 'idle')
                  }
                />
              </span>
            </div>
            <div className="stat">
              <strong>Started</strong>
              <span className="stat-mono">{fmtWhen(run.started_at)}</span>
            </div>
            <div className="stat">
              <strong>Ended</strong>
              <span className="stat-mono">{fmtWhen(run.ended_at)}</span>
            </div>
            <div className="stat wide">
              <strong>Session</strong>
              <span className="stat-mono">{run.executor_session_id ?? '—'}</span>
            </div>
          </div>

          <div className="toolbar">
            <Link className="btn ghost" to={`/projects/${run.project_id}`}>
              {projectName ?? 'Project'}
            </Link>
            <button type="button" className="ghost" disabled={txBusy} onClick={() => void loadTranscript()}>
              {txBusy ? 'Loading…' : 'Refresh transcript'}
            </button>
            {tx && (
              <span className="muted">
                {tx.executorId} · {tx.eventCount} events · {tx.fileOps.length} file ops
              </span>
            )}
          </div>

          <div className="steps" role="tablist">
            <button
              type="button"
              className={tab === 'transcript' ? 'on' : ''}
              onClick={() => setTab('transcript')}
            >
              Transcript
            </button>
            <span aria-hidden>·</span>
            <button
              type="button"
              className={tab === 'files' ? 'on' : ''}
              onClick={() => setTab('files')}
            >
              File ops
            </button>
            <span aria-hidden>·</span>
            <button
              type="button"
              className={tab === 'brief' ? 'on' : ''}
              onClick={() => setTab('brief')}
            >
              Brief
            </button>
          </div>

          {tab === 'transcript' && (
            <div className="card chat-card">
              <h2>Live transcript</h2>
              {!tx ? (
                <div className="empty tight">
                  Transcript not loaded. Configure My Executor (host_http) and refresh — errors
                  surface above (no silent empty).
                </div>
              ) : !tx.messages.length ? (
                <div className="empty tight">Executor returned history with no projectable messages.</div>
              ) : (
                <div className="chat-log">
                  {tx.messages.map((m) => (
                    <div key={`${m.seq}-${m.type}`} className={`chat-bubble ${m.role === 'user' ? 'you' : m.role}`}>
                      <strong>
                        {m.role} · {m.type}
                      </strong>
                      <p>{m.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'files' && (
            <div className="card">
              <h2>File operations (from executor tools)</h2>
              <p className="muted">
                Paths and tool cards reported by the coding host — not a local git substitute.
              </p>
              {!tx ? (
                <div className="empty tight">Load transcript first.</div>
              ) : !tx.fileOps.length ? (
                <div className="empty tight">No file/tool ops in this session history.</div>
              ) : (
                <ul className="list">
                  {tx.fileOps.map((f) => (
                    <li key={`${f.seq}-${f.tool}`}>
                      <div>
                        <strong>{f.tool}</strong>
                        <div className="muted path-line">{f.path ?? '(no path)'}</div>
                        <div className="muted">{f.summary}</div>
                      </div>
                      <span className="badge">seq {f.seq}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'brief' && (
            <div className="card">
              <h2>Session brief (input)</h2>
              <p className="muted">Control-plane snapshot at nudge time.</p>
              {briefPretty ? (
                <textarea className="mono" rows={18} readOnly value={briefPretty} />
              ) : (
                <div className="empty tight">No brief_json stored on this run.</div>
              )}
            </div>
          )}
        </>
      )}
    </Shell>
  )
}

function SettingsPage() {
  const { me } = useMe()
  const [form, setForm] = useState({
    workspaceRoot: '',
    githubCloneRoot: '',
    githubDefaultLogin: '',
    githubOAuthClientId: '',
    githubOAuthClientSecret: '',
    githubOAuthRedirectUri: '',
    lawpackRoot: '',
    lawpackPinPolicy: 'latest',
    injectionMode: 'harness_inject',
    injectStrength: 'hybrid',
    defaultPresetId: 'tracking',
    defaultProfileId: 'tracking-cycle',
    defaultScheduleMode: 'infinite',
    defaultReviewMode: 'human',
    defaultCronExpr: '0 3 * * *',
    setupCompleted: false,
  })
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showRaw, setShowRaw] = useState(false)
  const [raw, setRaw] = useState('')

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setRaw(JSON.stringify(s, null, 2))
        setForm({
          workspaceRoot: String(s.workspaceRoot ?? ''),
          githubCloneRoot: String(s.githubCloneRoot ?? ''),
          githubDefaultLogin: String(s.githubDefaultLogin ?? ''),
          githubOAuthClientId: String(s.githubOAuthClientId ?? ''),
          githubOAuthClientSecret:
            s.githubOAuthClientSecret === '***'
              ? '***'
              : String(s.githubOAuthClientSecret ?? ''),
          githubOAuthRedirectUri: String(s.githubOAuthRedirectUri ?? ''),
          lawpackRoot: String(s.lawpackRoot ?? ''),
          lawpackPinPolicy: String(s.lawpackPinPolicy ?? 'latest'),
          injectionMode: String(s.injectionMode ?? 'harness_inject'),
          injectStrength: String(s.injectStrength ?? 'hybrid'),
          defaultPresetId: String(s.defaultPresetId ?? 'tracking'),
          defaultProfileId: String(s.defaultProfileId ?? 'tracking-cycle'),
          defaultScheduleMode: String(s.defaultScheduleMode ?? 'infinite'),
          defaultReviewMode: String(s.defaultReviewMode ?? 'human'),
          defaultCronExpr: String(s.defaultCronExpr ?? ''),
          setupCompleted: Boolean(s.setupCompleted),
        })
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [])

  if (me && me.role !== 'admin') {
    return (
      <Shell>
        <PageHead title="Settings" />
        <Flash err="Admin role required." />
      </Shell>
    )
  }

  async function save() {
    setErr(null)
    setOk(null)
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        workspaceRoot: form.workspaceRoot || null,
        githubCloneRoot: form.githubCloneRoot || null,
        githubDefaultLogin: form.githubDefaultLogin || null,
        githubOAuthClientId: form.githubOAuthClientId || null,
        githubOAuthRedirectUri: form.githubOAuthRedirectUri || null,
        lawpackRoot: form.lawpackRoot || null,
        lawpackPinPolicy: form.lawpackPinPolicy,
        injectionMode: form.injectionMode,
        injectStrength: form.injectStrength,
        defaultPresetId: form.defaultPresetId,
        defaultProfileId: form.defaultProfileId,
        defaultScheduleMode: form.defaultScheduleMode,
        defaultReviewMode: form.defaultReviewMode,
        defaultCronExpr: form.defaultCronExpr || null,
        setupCompleted: form.setupCompleted,
      }
      if (form.githubOAuthClientSecret) {
        body.githubOAuthClientSecret = form.githubOAuthClientSecret
      }
      const saved = await api.putSettings(body)
      setRaw(JSON.stringify(saved, null, 2))
      setOk('Settings saved')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <PageHead
        title="Settings"
        lead="Host-wide configuration. Deployment policy is under Admin; per-user DSH under Executor."
      />
      <Flash err={err} ok={ok} />
      {loading ? (
        <p className="loading">Loading settings…</p>
      ) : (
        <>
      <div className="card">
        <h2>Workspace</h2>
        <label>
          Workspace root
          <input
            value={form.workspaceRoot}
            onChange={(e) => setForm({ ...form, workspaceRoot: e.target.value })}
            placeholder="/workspaces"
          />
        </label>
        <label>
          GitHub clone root
          <input
            value={form.githubCloneRoot}
            onChange={(e) => setForm({ ...form, githubCloneRoot: e.target.value })}
          />
        </label>
        <label>
          Default GitHub login
          <input
            value={form.githubDefaultLogin}
            onChange={(e) => setForm({ ...form, githubDefaultLogin: e.target.value })}
          />
        </label>
      </div>

      <div className="card">
        <h2>GitHub OAuth App</h2>
        <label>
          Client ID
          <input
            value={form.githubOAuthClientId}
            onChange={(e) => setForm({ ...form, githubOAuthClientId: e.target.value })}
          />
        </label>
        <label>
          Client secret
          <input
            type="password"
            value={form.githubOAuthClientSecret}
            onChange={(e) => setForm({ ...form, githubOAuthClientSecret: e.target.value })}
            placeholder="unchanged if ***"
          />
        </label>
        <label>
          Redirect URI
          <input
            value={form.githubOAuthRedirectUri}
            onChange={(e) => setForm({ ...form, githubOAuthRedirectUri: e.target.value })}
          />
        </label>
      </div>

      <div className="card">
        <h2>Lawpack & injection</h2>
        <label>
          Lawpack root
          <input
            value={form.lawpackRoot}
            onChange={(e) => setForm({ ...form, lawpackRoot: e.target.value })}
            placeholder="(repo lawpack/)"
          />
        </label>
        <label>
          Pin policy
          <input
            value={form.lawpackPinPolicy}
            onChange={(e) => setForm({ ...form, lawpackPinPolicy: e.target.value })}
          />
        </label>
        <label>
          Injection mode
          <select
            value={form.injectionMode}
            onChange={(e) => setForm({ ...form, injectionMode: e.target.value })}
          >
            <option value="harness_inject">harness_inject</option>
            <option value="repo_plant">repo_plant</option>
          </select>
        </label>
        <label>
          Inject strength
          <select
            value={form.injectStrength}
            onChange={(e) => setForm({ ...form, injectStrength: e.target.value })}
          >
            <option value="strict">strict</option>
            <option value="hybrid">hybrid</option>
          </select>
        </label>
      </div>

      <div className="card">
        <h2>Defaults</h2>
        <label>
          Preset
          <select
            value={form.defaultPresetId}
            onChange={(e) => setForm({ ...form, defaultPresetId: e.target.value })}
          >
            <option value="clean">clean</option>
            <option value="tracking">tracking</option>
            <option value="offline">offline</option>
          </select>
        </label>
        <label>
          Profile id
          <input
            value={form.defaultProfileId}
            onChange={(e) => setForm({ ...form, defaultProfileId: e.target.value })}
          />
        </label>
        <label>
          Schedule mode
          <select
            value={form.defaultScheduleMode}
            onChange={(e) => setForm({ ...form, defaultScheduleMode: e.target.value })}
          >
            <option value="infinite">infinite</option>
            <option value="cron">cron</option>
            <option value="once">once</option>
            <option value="on_event">on_event</option>
            <option value="manual">manual</option>
          </select>
        </label>
        <label>
          Review mode
          <select
            value={form.defaultReviewMode}
            onChange={(e) => setForm({ ...form, defaultReviewMode: e.target.value })}
          >
            <option value="human">human</option>
            <option value="llm_propose">llm_propose</option>
            <option value="llm_auto">llm_auto</option>
          </select>
        </label>
        <label>
          Cron expr
          <input
            value={form.defaultCronExpr}
            onChange={(e) => setForm({ ...form, defaultCronExpr: e.target.value })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={form.setupCompleted}
            onChange={(e) => setForm({ ...form, setupCompleted: e.target.checked })}
          />
          Mark global setup completed
        </label>
      </div>

      <div className="row">
        <button type="button" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() =>
            api
              .testDsh()
              .then(() => setOk('DSH ping ok (your executor)'))
              .catch((e) => setErr(String(e)))
          }
        >
          Test DSH
        </button>
        <Link className="btn ghost" to="/admin">
          Admin deployment
        </Link>
        <button type="button" className="ghost" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
        </button>
      </div>

      {showRaw && (
        <div className="card">
          <h2>Raw document</h2>
          <textarea className="mono" rows={16} value={raw} readOnly />
        </div>
      )}
        </>
      )}
    </Shell>
  )
}

function AdminPage() {
  const { me } = useMe()
  const [mode, setMode] = useState<'personal' | 'hosted' | 'hybrid'>('hybrid')
  const [authApi, setAuthApi] = useState(true)
  const [bootstrap, setBootstrap] = useState(true)
  const [githubSignupMode, setGithubSignupMode] = useState<'closed' | 'open' | 'allowlist'>(
    'closed',
  )
  const [allowlistText, setAllowlistText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .getDeployment()
      .then((d) => {
        setMode(d.deploymentMode)
        setAuthApi(d.authRequiredForApi)
        setBootstrap(d.allowBootstrapRegister)
        setGithubSignupMode(d.githubSignupMode ?? 'closed')
        setAllowlistText((d.githubSignupAllowlist ?? []).join('\n'))
      })
      .catch((e) => setErr(String(e)))
  }, [])

  if (me && me.role !== 'admin') {
    return (
      <Shell>
        <PageHead title="Admin" />
        <Flash err="Admin role required." />
      </Shell>
    )
  }

  async function save() {
    setErr(null)
    setOk(null)
    setBusy(true)
    try {
      const allowlist = allowlistText
        .split(/[\n,]+/)
        .map((x) => x.trim().replace(/^@/, ''))
        .filter(Boolean)
      const d = (await api.putDeployment({
        deploymentMode: mode,
        authRequiredForApi: authApi,
        allowBootstrapRegister: bootstrap,
        githubSignupMode,
        githubSignupAllowlist: allowlist,
      })) as {
        deploymentMode: typeof mode
        authRequiredForApi: boolean
        allowBootstrapRegister: boolean
        githubSignupMode: typeof githubSignupMode
        githubSignupAllowlist: string[]
      }
      setMode(d.deploymentMode)
      setAuthApi(d.authRequiredForApi)
      setBootstrap(d.allowBootstrapRegister)
      setGithubSignupMode(d.githubSignupMode)
      setAllowlistText((d.githubSignupAllowlist ?? []).join('\n'))
      setOk('Deployment policy saved')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const modes: Array<{ id: typeof mode; title: string; blurb: string }> = [
    {
      id: 'hybrid',
      title: 'Hybrid',
      blurb: 'Public home. Login required for catalog, cron, executor APIs.',
    },
    {
      id: 'personal',
      title: 'Personal',
      blurb: 'Single-operator host. Softer auth defaults for local use.',
    },
    {
      id: 'hosted',
      title: 'Hosted',
      blurb: 'Multi-user server. Treat this as a shared control plane.',
    },
  ]

  const signupModes: Array<{
    id: typeof githubSignupMode
    title: string
    blurb: string
  }> = [
    {
      id: 'closed',
      title: 'Closed (default)',
      blurb: 'Existing users may log in with GitHub. No new accounts via OAuth/PAT.',
    },
    {
      id: 'open',
      title: 'Open',
      blurb: 'Anyone who authenticates with GitHub gets an operator account.',
    },
    {
      id: 'allowlist',
      title: 'Allowlist',
      blurb: 'New accounts only for listed GitHub logins. Everyone else login-only if already registered.',
    },
  ]

  return (
    <Shell>
      <PageHead
        title="Admin"
        lead="Who can use this host and how. Self-host elsewhere = clone repo + docker compose."
      />
      <Flash err={err} ok={ok} />

      <div className="card">
        <h2>Deployment mode</h2>
        <div className="mode-grid">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`mode-card${mode === m.id ? ' on' : ''}`}
              onClick={() => {
                setMode(m.id)
                setAuthApi(m.id !== 'personal')
              }}
            >
              <strong>{m.title}</strong>
              <span>{m.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>GitHub signup</h2>
        <p className="muted">
          Login for existing accounts always works. This only controls whether OAuth/PAT may create
          new users.
        </p>
        <div className="mode-grid">
          {signupModes.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`mode-card${githubSignupMode === m.id ? ' on' : ''}`}
              onClick={() => setGithubSignupMode(m.id)}
            >
              <strong>{m.title}</strong>
              <span>{m.blurb}</span>
            </button>
          ))}
        </div>
        {githubSignupMode === 'allowlist' && (
          <label className="field" style={{ marginTop: '1rem' }}>
            Allowed GitHub logins (one per line or comma-separated)
            <textarea
              rows={5}
              value={allowlistText}
              onChange={(e) => setAllowlistText(e.target.value)}
              placeholder={'alice\nbob'}
            />
          </label>
        )}
      </div>

      <div className="card">
        <h2>Access policy</h2>
        <label className="check">
          <input type="checkbox" checked={authApi} onChange={(e) => setAuthApi(e.target.checked)} />
          Auth required for server API
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={bootstrap}
            onChange={(e) => setBootstrap(e.target.checked)}
          />
          Allow bootstrap register (first admin only when userCount = 0)
        </label>
        <div className="row">
          <button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save deployment'}
          </button>
          <Link className="btn ghost" to="/settings">
            Host settings
          </Link>
        </div>
      </div>
    </Shell>
  )
}

function ChatPage() {
  const [msg, setMsg] = useState('')
  const [log, setLog] = useState<{ role: 'you' | 'ak'; text: string }[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    const text = msg.trim()
    try {
      const r = await api.chat(text)
      setLog((l) => [...l, { role: 'you', text }, { role: 'ak', text: r.reply }])
      setMsg('')
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <PageHead
        title="Operator chat"
        lead="LLM tools against this control plane. Requires GateWay URL + API key on Executor step 2."
      />
      <Flash err={err} />
      <div className="card chat-card">
        <h2>Transcript</h2>
        {!log.length ? (
          <div className="empty tight">
            No messages yet.{' '}
            <Link to="/setup">Configure GateWay</Link> if chat fails with missing credentials.
          </div>
        ) : (
          <div className="chat-log">
            {log.map((m, i) => (
              <div key={`${m.role}-${i}`} className={`chat-bubble ${m.role}`}>
                <strong>{m.role === 'you' ? 'You' : 'Kernel'}</strong>
                <p>{m.text}</p>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={(e) => void send(e)} className="compose">
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Ask about projects, runs, schedules…"
          />
          <button type="submit" disabled={busy || !msg.trim()}>
            {busy ? '…' : 'Send'}
          </button>
        </form>
      </div>
    </Shell>
  )
}

function NotFound() {
  return (
    <Shell variant="public">
      <section className="hero-screen">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p className="tagline">That route does not exist on this control plane.</p>
        <div className="hero-cta">
          <Link className="btn" to="/">
            Home
          </Link>
          <Link className="btn ghost" to="/overview">
            Overview
          </Link>
        </div>
      </section>
    </Shell>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <MeProvider>
        <Routes>
          <Route path="/" element={<PublicHome />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/setup"
            element={
              <RequireAuthRelax>
                <SetupWizard />
              </RequireAuthRelax>
            }
          />
          <Route
            path="/overview"
            element={
              <RequireAuth>
                <Overview />
              </RequireAuth>
            }
          />
          <Route
            path="/projects"
            element={
              <RequireAuth>
                <ProjectsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <RequireAuth>
                <ProjectDetail />
              </RequireAuth>
            }
          />
          <Route
            path="/agents"
            element={
              <RequireAuth>
                <AgentsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/runs"
            element={
              <RequireAuth>
                <RunsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/runs/:runId"
            element={
              <RequireAuth>
                <RunDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <SettingsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <AdminPage />
              </RequireAuth>
            }
          />
          <Route
            path="/chat"
            element={
              <RequireAuth>
                <ChatPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MeProvider>
    </BrowserRouter>
  )
}
