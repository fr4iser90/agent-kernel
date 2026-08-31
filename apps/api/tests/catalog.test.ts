import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Kernel } from '../src/application/kernel.js'
import { openSqlite } from '../src/infrastructure/sqlite/db.js'
import { SqliteProjectRepository } from '../src/infrastructure/sqlite/project-repository.js'
import { SqliteSettingsRepository } from '../src/infrastructure/sqlite/settings-repository.js'
import { createApp } from '../src/presentation/app.js'

function testKernel() {
  const db = openSqlite(':memory:')
  const projects = new SqliteProjectRepository(db)
  const settingsRepo = new SqliteSettingsRepository(db)
  const repoRoot = join(process.cwd(), '..', '..')
  const k = new Kernel({ db, projects, settingsRepo, repoRoot })
  return k
}

async function authedApp() {
  const kernel = testKernel()
  const app = createApp(kernel)
  const reg = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'op1', password: 'secret123' })
  })
  const { token, ownerId } = (await reg.json()) as { token: string; ownerId: string }
  kernel.markExecutorPaired(ownerId)
  return { app, token, ownerId, kernel }
}

describe('auth + catalog', () => {
  it('password login then register project', async () => {
    const { app, token, ownerId } = await authedApp()
    const res = await app.request('/api/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ak-session': token
      },
      body: JSON.stringify({ name: 'demo', path: '/executor/workdir/demo' })
    })
    expect(res.status).toBe(201)
    const json = (await res.json()) as { project: { id: string; ownerId: string; localPath: string } }
    expect(json.project.ownerId).toBe(ownerId)
    expect(json.project.localPath).toBe('/executor/workdir/demo')

    const init = await app.request(`/api/projects/${json.project.id}/init`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ak-session': token
      },
      body: JSON.stringify({ presetId: 'tracking' })
    })
    expect(init.status).toBe(200)

    const list = await app.request('/api/projects', {
      headers: { 'x-ak-session': token }
    })
    expect(list.status).toBe(200)
  })
})
