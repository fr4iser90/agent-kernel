import { describe, expect, it } from 'vitest'
import { CatalogService } from '../src/application/catalog-service.js'
import { openSqlite } from '../src/infrastructure/sqlite/db.js'
import { SqliteProjectRepository } from '../src/infrastructure/sqlite/project-repository.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('CatalogService', () => {
  it('registers and lists for owner', () => {
    const db = openSqlite(':memory:')
    const projects = new SqliteProjectRepository(db)
    const svc = new CatalogService(projects)
    const dir = mkdtempSync(join(tmpdir(), 'ak-cat-'))
    const owner = 'user-1'
    const p = svc.registerProject(owner, { name: 'x', localPath: dir })
    expect(p.name).toBe('x')
    expect(svc.listProjects(owner).length).toBe(1)
    expect(() => svc.registerProject(owner, { name: ' ', localPath: dir })).toThrow()
  })
})
