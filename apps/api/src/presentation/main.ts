import { serve } from '@hono/node-server'
import type { Server as HttpServer } from 'node:http'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Kernel } from '../application/kernel.js'
import { openSqlite } from '../infrastructure/sqlite/db.js'
import { SqliteProjectRepository } from '../infrastructure/sqlite/project-repository.js'
import { SqliteSettingsRepository } from '../infrastructure/sqlite/settings-repository.js'
import { createApp } from './app.js'
import { attachExecutorWebSocket } from './executor-ws.js'

const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? '0.0.0.0'
const dbPath = process.env.DB_PATH ?? join(process.cwd(), 'data', 'agent-kernel.db')
const repoRoot = resolve(
  process.env.AK_REPO_ROOT ??
    join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..'),
)

const db = openSqlite(dbPath)
const projects = new SqliteProjectRepository(db)
const settingsRepo = new SqliteSettingsRepository(db)
const kernel = new Kernel({ db, projects, settingsRepo, repoRoot })
const app = createApp(kernel)

console.log(`agent-kernel api listening on http://${host}:${port}`)
console.log(`sqlite: ${dbPath}`)
console.log(`repoRoot: ${repoRoot}`)
console.log(`executor WSS: ws://${host}:${port}/api/executor/ws?token=…`)

const server = serve({ fetch: app.fetch, port, hostname: host }) as unknown as HttpServer
attachExecutorWebSocket(server, kernel)

const cronMs = Number(process.env.SCHEDULER_INTERVAL_MS ?? 60_000)
if (cronMs > 0) {
  console.log(`scheduler tick every ${cronMs}ms`)
  setInterval(() => {
    void kernel.schedulerTick().then((r) => {
      if (r.fired.length || r.errors.length) {
        console.log('[scheduler]', JSON.stringify(r))
      }
    })
  }, cronMs).unref()
}
