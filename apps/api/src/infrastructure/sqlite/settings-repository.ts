import type Database from 'better-sqlite3'
import {
  DEFAULT_SETTINGS,
  type AgentKernelSettings,
  type GithubSignupMode,
} from '../../domain/settings/settings.js'

const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof AgentKernelSettings)[]

/** Keep only known settings keys — dropped fields never re-enter the document. */
function pickSettings(raw: Record<string, unknown>): AgentKernelSettings {
  const out: AgentKernelSettings = {
    ...DEFAULT_SETTINGS,
    layoutPaths: { ...DEFAULT_SETTINGS.layoutPaths },
    githubSignupAllowlist: [...DEFAULT_SETTINGS.githubSignupAllowlist],
    forbidRunIdForkSuffixes: [...DEFAULT_SETTINGS.forbidRunIdForkSuffixes],
  }

  for (const key of SETTINGS_KEYS) {
    if (!(key in raw) || raw[key as string] === undefined) continue
    if (key === 'layoutPaths') {
      if (raw.layoutPaths && typeof raw.layoutPaths === 'object') {
        out.layoutPaths = {
          ...DEFAULT_SETTINGS.layoutPaths,
          ...(raw.layoutPaths as Record<string, string>),
        }
      }
      continue
    }
    ;(out as Record<string, unknown>)[key] = raw[key as string]
  }

  if (!Array.isArray(out.githubSignupAllowlist)) {
    out.githubSignupAllowlist = [...DEFAULT_SETTINGS.githubSignupAllowlist]
  }
  if (!Array.isArray(out.forbidRunIdForkSuffixes)) {
    out.forbidRunIdForkSuffixes = [...DEFAULT_SETTINGS.forbidRunIdForkSuffixes]
  }
  if (typeof out.authRequiredForApi !== 'boolean') {
    out.authRequiredForApi = true
  }
  const mode = out.githubSignupMode as GithubSignupMode
  if (mode !== 'closed' && mode !== 'open' && mode !== 'allowlist') {
    out.githubSignupMode = 'closed'
  }
  return out
}

export class SqliteSettingsRepository {
  constructor(private readonly db: Database.Database) {}

  get(): AgentKernelSettings {
    const row = this.db.prepare(`SELECT doc_json FROM settings WHERE id = 'global'`).get() as
      | { doc_json: string }
      | undefined
    if (!row) return pickSettings({})
    return pickSettings(JSON.parse(row.doc_json) as Record<string, unknown>)
  }

  put(doc: AgentKernelSettings): AgentKernelSettings {
    const clean = pickSettings(doc as unknown as Record<string, unknown>)
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO settings (id, doc_json, updated_at) VALUES ('global', @doc, @now)
         ON CONFLICT(id) DO UPDATE SET doc_json = excluded.doc_json, updated_at = excluded.updated_at`,
      )
      .run({ doc: JSON.stringify(clean), now })
    return this.get()
  }
}
