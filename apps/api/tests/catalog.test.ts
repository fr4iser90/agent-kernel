import { describe, expect, it } from 'vitest'
import { CatalogService } from '../src/application/catalog-service.js'
import { openSqlite, SqliteProjectRepository } from '../src/infrastructure/sqlite/project-repository.js'
import { createApp } from '../src/presentation/app.js'
import { LOCAL_OWNER_ID } from '../src/domain/identity/owner.js'

describe('catalog', () => {
  it('registers and lists projects for local-owner', async () => {
    const db = openSqlite(':memory:')
    const repo = new SqliteProjectRepository(db)
    const catalog = new CatalogService(repo)
    const created = catalog.registerProject({
      name: 'demo',
      localPath: '/tmp/demo',
      gitRemote: null,
    })
    expect(created.ownerId).toBe(LOCAL_OWNER_ID)
    expect(created.status).toBe('registered')
    expect(catalog.listProjects()).toHaveLength(1)

    const app = createApp(catalog)
    const res = await app.request('/api/projects')
    expect(res.status).toBe(200)
    const json = (await res.json()) as { projects: unknown[] }
    expect(json.projects).toHaveLength(1)
  })
})
