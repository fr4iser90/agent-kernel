import type Database from 'better-sqlite3'
import type { Project, ProjectId, RegisterProjectInput } from '../../domain/catalog/project.js'
import type { ProjectRepository } from '../../domain/catalog/project-repository.js'

function rowToProject(row: Record<string, unknown>): Project {
  let meta: Record<string, unknown> = {}
  try {
    meta = JSON.parse(String(row.meta_json ?? '{}')) as Record<string, unknown>
  } catch {
    meta = {}
  }
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name),
    localPath: String(row.local_path),
    gitRemote: row.git_remote == null ? null : String(row.git_remote),
    status: row.status as Project['status'],
    lawpackVersion: row.lawpack_version == null ? null : String(row.lawpack_version),
    meta,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly db: Database.Database) {}

  listByOwner(ownerId: string): Project[] {
    const rows = this.db
      .prepare(`SELECT * FROM projects WHERE owner_id = ? ORDER BY created_at DESC`)
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
         (id, owner_id, name, local_path, git_remote, status, lawpack_version, meta_json, created_at, updated_at)
         VALUES (@id, @ownerId, @name, @localPath, @gitRemote, 'registered', NULL, '{}', @now, @now)`,
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

  update(project: Project): Project {
    this.db
      .prepare(
        `UPDATE projects SET name=@name, local_path=@localPath, git_remote=@gitRemote,
         status=@status, lawpack_version=@lawpackVersion, meta_json=@meta, updated_at=@updatedAt
         WHERE id=@id`,
      )
      .run({
        id: project.id,
        name: project.name,
        localPath: project.localPath,
        gitRemote: project.gitRemote,
        status: project.status,
        lawpackVersion: project.lawpackVersion,
        meta: JSON.stringify(project.meta ?? {}),
        updatedAt: project.updatedAt,
      })
    const updated = this.getById(project.id)
    if (!updated) throw new Error('update failed')
    return updated
  }
}
