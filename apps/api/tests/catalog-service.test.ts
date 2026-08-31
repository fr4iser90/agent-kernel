import { describe, expect, it } from 'vitest'
import { CatalogService } from '../src/application/catalog-service.js'
import { openSqlite } from '../src/infrastructure/sqlite/db.js'
import { SqliteProjectRepository } from '../src/infrastructure/sqlite/project-repository.js'

describe('CatalogService', () => {
  it('registers and lists for owner', () => {
    const db = openSqlite(':memory:')
    const projects = new SqliteProjectRepository(db)
    const svc = new CatalogService(projects)
    const owner = 'user-1'
    const p = svc.registerProject(owner, { name: 'x', localPath: '/executor/workdir/x' })
    expect(p.name).toBe('x')
    expect(p.localPath).toBe('/executor/workdir/x')
    expect(svc.listProjects(owner).length).toBe(1)
    expect(() =>
      svc.registerProject(owner, { name: ' ', localPath: '/executor/workdir/x' }),
    ).toThrow()
  })
})
