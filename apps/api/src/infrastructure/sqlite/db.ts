import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export function openSqlite(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      local_path TEXT NOT NULL,
      git_remote TEXT,
      status TEXT NOT NULL,
      lawpack_version TEXT,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY CHECK (id = 'global'),
      doc_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      role_path TEXT NOT NULL,
      lawpack_profile_overlay TEXT,
      default_schedule_mode TEXT NOT NULL,
      default_review_mode TEXT NOT NULL,
      default_executor_id TEXT,
      doc_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      project_id TEXT,
      profile_id TEXT NOT NULL,
      schedule_mode TEXT NOT NULL,
      cron_expr TEXT,
      review_mode TEXT NOT NULL,
      run_id TEXT,
      paused INTEGER NOT NULL DEFAULT 0,
      executor_id TEXT,
      fan_out_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_assignments_project ON assignments(project_id);

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      executor_id TEXT NOT NULL,
      executor_session_id TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      outcome TEXT,
      brief_json TEXT,
      brief_hash TEXT,
      deny_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'local',
      github_login TEXT,
      access_token TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      project_id TEXT,
      assignment_id TEXT,
      run_id TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      github_id TEXT UNIQUE,
      github_login TEXT,
      github_access_token TEXT,
      role TEXT NOT NULL DEFAULT 'operator',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      doc_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  // migrate older projects table without meta_json
  const cols = db.prepare(`PRAGMA table_info(projects)`).all() as { name: string }[]
  if (!cols.some((c) => c.name === 'meta_json')) {
    db.exec(`ALTER TABLE projects ADD COLUMN meta_json TEXT NOT NULL DEFAULT '{}'`)
  }

  // migrate sessions for GitHub auth
  const sessCols = db.prepare(`PRAGMA table_info(sessions)`).all() as { name: string }[]
  if (!sessCols.some((c) => c.name === 'provider')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN provider TEXT NOT NULL DEFAULT 'local'`)
  }
  if (!sessCols.some((c) => c.name === 'github_login')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN github_login TEXT`)
  }
  if (!sessCols.some((c) => c.name === 'access_token')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN access_token TEXT`)
  }

  return db
}
