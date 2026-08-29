import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Project, ProjectId, RegisterProjectInput } from '../../domain/catalog/project.js'
import type { ProjectRepository } from '../../domain/catalog/project-repository.js'

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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
  `)
  return db
}

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name),
    localPath: String(row.local_path),
    gitRemote: row.git_remote == null ? null : String(row.git_remote),
    status: row.status as Project['status'],
    lawpackVersion: row.lawpack_version == null ? null : String(row.lawpack_version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly db: Database.Database) {}

  listByOwner(ownerId: string): Project[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM projects WHERE owner_id = ? ORDER BY created_at DESC`,
      )
      .all(ownerId) as Record<string, unknown>[]
    return rows.map(rowToProject)
  }

  getById(id: ProjectId): Project | null {
    const row = this.db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined
    return row ? rowToProject(row) : null
  }

  create(
    input: RegisterProjectInput & { ownerId: string; id: string; now: string },
  ): Project {
    this.db
      .prepare(
        `INSERT INTO projects
         (id, owner_id, name, local_path, git_remote, status, lawpack_version, created_at, updated_at)
         VALUES (@id, @ownerId, @name, @localPath, @gitRemote, 'registered', NULL, @now, @now)`,
      )
      .run({
        id: input.id,
        ownerId: input.ownerId,
        name: input.name,
        localPath: input.localPath,
        gitRemote: input.gitRemote ?? null,
        now: input.now,
      })
    const created = this.getById(input.id)
    if (!created) throw new Error('insert failed')
    return created
  }
}
