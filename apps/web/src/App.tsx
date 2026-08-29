import { FormEvent, useCallback, useEffect, useState } from 'react'
import { fetchProjects, registerProject, type Project } from './api'

export function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [gitRemote, setGitRemote] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    setError(null)
    try {
      setProjects(await fetchProjects())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await registerProject({
        name,
        localPath,
        gitRemote: gitRemote.trim() || undefined,
      })
      setName('')
      setLocalPath('')
      setGitRemote('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'register failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="shell">
      <header className="hero">
        <p className="eyebrow">agent-kernel</p>
        <h1>Projects</h1>
        <p className="lede">
          Local control plane — register git projects, then initialize Lawpack (next).
        </p>
      </header>

      {error ? <p className="error" role="alert">{error}</p> : null}

      <section className="panel">
        <h2>Register</h2>
        <form className="form" onSubmit={onSubmit}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Local path
            <input
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              placeholder="/home/…/my-repo"
              required
            />
          </label>
          <label>
            Git remote (optional)
            <input
              value={gitRemote}
              onChange={(e) => setGitRemote(e.target.value)}
              placeholder="https://github.com/…"
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Add project'}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Registered</h2>
          <button type="button" className="ghost" onClick={() => void reload()}>
            Refresh
          </button>
        </div>
        {projects.length === 0 ? (
          <p className="muted">No projects yet.</p>
        ) : (
          <ul className="list">
            {projects.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong>
                <span className="badge">{p.status}</span>
                <code>{p.localPath}</code>
                {p.gitRemote ? <span className="muted">{p.gitRemote}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
