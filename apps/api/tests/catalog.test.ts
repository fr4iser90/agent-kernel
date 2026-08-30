import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
  return new Kernel({ db, projects, settingsRepo, repoRoot })
}

async function authedApp() {
  const kernel = testKernel()
  const app = createApp(kernel)
  const reg = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'op1', password: 'secret123' }),
  })
  const { token, ownerId } = (await reg.json()) as { token: string; ownerId: string }
  await app.request('/api/me/executor', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-ak-session': token },
    body: JSON.stringify({
      dshInvokeMode: 'cli',
      dshCliRoot: mkdtempSync(join(tmpdir(), 'cli-')),
      dshHome: mkdtempSync(join(tmpdir(), 'home-')),
    }),
  })
  return { app, token, ownerId, kernel }
}

describe('auth + catalog', () => {
  it('password login then register project', async () => {
    const { app, token, ownerId } = await authedApp()
    const dir = mkdtempSync(join(tmpdir(), 'ak-'))
    const res = await app.request('/api/projects', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ak-session': token,
      },
      body: JSON.stringify({ name: 'demo', path: dir }),
    })
    expect(res.status).toBe(201)
    const json = (await res.json()) as { project: { ownerId: string } }
    expect(json.project.ownerId).toBe(ownerId)

    const list = await app.request('/api/projects', {
      headers: { 'x-ak-session': token },
    })
    expect(list.status).toBe(200)
  })
})
