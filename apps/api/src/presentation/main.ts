import { serve } from '@hono/node-server'
import { join } from 'node:path'
import { CatalogService } from '../application/catalog-service.js'
import { openSqlite, SqliteProjectRepository } from '../infrastructure/sqlite/project-repository.js'
import { createApp } from './app.js'

const port = Number(process.env.PORT ?? 8787)
const dbPath = process.env.DB_PATH ?? join(process.cwd(), 'data', 'agent-kernel.db')

const db = openSqlite(dbPath)
const projects = new SqliteProjectRepository(db)
const catalog = new CatalogService(projects)
const app = createApp(catalog)

console.log(`agent-kernel api listening on http://127.0.0.1:${port}`)
console.log(`sqlite: ${dbPath}`)
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' })
