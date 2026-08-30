import type Database from 'better-sqlite3'
import {
  DEFAULT_SETTINGS,
  type AgentKernelSettings,
} from '../../domain/settings/settings.js'

export class SqliteSettingsRepository {
  constructor(private readonly db: Database.Database) {}

  get(): AgentKernelSettings {
    const row = this.db.prepare(`SELECT doc_json FROM settings WHERE id = 'global'`).get() as
      | { doc_json: string }
      | undefined
    if (!row) return { ...DEFAULT_SETTINGS, layoutPaths: { ...DEFAULT_SETTINGS.layoutPaths } }
    const parsed = JSON.parse(row.doc_json) as Partial<AgentKernelSettings> & {
      deploymentMode?: string
      allowAnonymousKitDownload?: boolean
    }
    // Drop removed kit fields; migrate old local_kit → personal
    const { allowAnonymousKitDownload: _drop, ...rest } = parsed
    void _drop
    let deploymentMode = rest.deploymentMode as AgentKernelSettings['deploymentMode'] | undefined
    if (deploymentMode === ('local_kit' as never)) deploymentMode = 'personal'
    return {
      ...DEFAULT_SETTINGS,
      ...rest,
      deploymentMode: deploymentMode ?? DEFAULT_SETTINGS.deploymentMode,
      githubSignupMode:
        (rest.githubSignupMode as AgentKernelSettings['githubSignupMode'] | undefined) ??
        DEFAULT_SETTINGS.githubSignupMode,
      githubSignupAllowlist: Array.isArray(rest.githubSignupAllowlist)
        ? rest.githubSignupAllowlist
        : DEFAULT_SETTINGS.githubSignupAllowlist,
      layoutPaths: { ...DEFAULT_SETTINGS.layoutPaths, ...(parsed.layoutPaths ?? {}) },
      forbidRunIdForkSuffixes:
        parsed.forbidRunIdForkSuffixes ?? DEFAULT_SETTINGS.forbidRunIdForkSuffixes,
    }
  }

  put(doc: AgentKernelSettings): AgentKernelSettings {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO settings (id, doc_json, updated_at) VALUES ('global', @doc, @now)
         ON CONFLICT(id) DO UPDATE SET doc_json = excluded.doc_json, updated_at = excluded.updated_at`,
      )
      .run({ doc: JSON.stringify(doc), now })
    return this.get()
  }
}
