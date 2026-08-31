import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { Kernel } from '../src/application/kernel.js'
import { openSqlite } from '../src/infrastructure/sqlite/db.js'
import { SqliteProjectRepository } from '../src/infrastructure/sqlite/project-repository.js'
import { SqliteSettingsRepository } from '../src/infrastructure/sqlite/settings-repository.js'
import { createApp } from '../src/presentation/app.js'
import { hashPassword } from '../src/infrastructure/auth/password.js'

function testKernel() {
  const db = openSqlite(':memory:')
  const k = new Kernel({
    db,
    projects: new SqliteProjectRepository(db),
    settingsRepo: new SqliteSettingsRepository(db),
    repoRoot: join(process.cwd(), '..', '..')
  })
  return k
}

function insertOperator(kernel: Kernel, username: string): { token: string; ownerId: string } {
  const id = randomUUID()
  const now = new Date().toISOString()
  kernel.deps.db
    .prepare(
      `INSERT INTO users (id, username, password_hash, github_id, github_login, github_access_token, role, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, NULL, 'operator', ?, ?)`,
    )
    .run(id, username, hashPassword('password-long-enough'), now, now)
  const token = kernel.createSession(id, { provider: 'password' })
  return { token, ownerId: id }
}

async function bootstrapAdmin(app: ReturnType<typeof createApp>, kernel: Kernel) {
  const reg = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'password-long-enough' })
  })
  const body = (await reg.json()) as { token: string; ownerId: string }
  kernel.markExecutorPaired(body.ownerId)
  return body
}

describe('owner scoping (IDOR)', () => {
  it('user B cannot read or mutate user A project/assignment/run', async () => {
    const kernel = testKernel()
    const app = createApp(kernel)
    const a = await bootstrapAdmin(app, kernel)
    const b = insertOperator(kernel, 'bob')
    kernel.markExecutorPaired(b.ownerId)

    const project = kernel.registerProject(a.ownerId, {
      name: 'a-proj',
      localPath: '/executor/workdir/a-proj'
    })
    const assignment = kernel.createAssignment({
      ownerId: a.ownerId,
      projectId: project.id,
      profileId: 'tracking-cycle',
      scheduleMode: 'manual',
      reviewMode: 'human'
    })!

    const hdrB = { 'content-type': 'application/json', 'x-ak-session': b.token }

    const getProj = await app.request(`/api/projects/${project.id}`, { headers: hdrB })
    expect(getProj.status).toBe(404)

    const init = await app.request(`/api/projects/${project.id}/init`, {
      method: 'POST',
      headers: hdrB,
      body: JSON.stringify({ presetId: 'tracking' })
    })
    expect(init.status).toBe(404)

    const listA = await app.request(`/api/projects/${project.id}/assignments`, {
      headers: hdrB
    })
    expect(listA.status).toBe(404)

    const patch = await app.request(`/api/assignments/${assignment.id}`, {
      method: 'PATCH',
      headers: hdrB,
      body: JSON.stringify({ paused: true })
    })
    expect(patch.status).toBe(404)

    const brief = await app.request(`/api/assignments/${assignment.id}/brief`, {
      method: 'POST',
      headers: hdrB
    })
    expect(brief.status).toBe(404)

    const del = await app.request(`/api/assignments/${assignment.id}`, {
      method: 'DELETE',
      headers: hdrB
    })
    expect(del.status).toBe(404)

    expect(kernel.getAssignment(assignment.id)).toBeTruthy()
    expect(kernel.getProject(a.ownerId, project.id)?.id).toBe(project.id)
    expect(kernel.getProject(b.ownerId, project.id)).toBeNull()
  })

  it('PUT /api/me/executor cannot set executorPaired', async () => {
    const kernel = testKernel()
    const app = createApp(kernel)
    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'pairhack', password: 'password-long-enough' })
    })
    const body = (await reg.json()) as { token: string; ownerId: string }
    expect(kernel.getUserExecutorSettings(body.ownerId).executorPaired).toBe(false)
    const res = await app.request('/api/me/executor', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-ak-session': body.token },
      body: JSON.stringify({ executorPaired: true })
    })
    expect(res.status).toBe(200)
    expect(kernel.getUserExecutorSettings(body.ownerId).executorPaired).toBe(false)
  })

  it('register accepts opaque Windows executor path', () => {
    const kernel = testKernel()
    const { ownerId } = kernel.registerPasswordUser({
      username: 'jailed',
      password: 'password-long-enough',
      bootstrap: true
    })
    const p = kernel.registerProject(ownerId, {
      name: 'mine',
      localPath: 'C:\\Users\\me\\code\\repo'
    })
    expect(p.localPath).toBe('C:\\Users\\me\\code\\repo')
    expect(p.status).toBe('registered')
  })

  it('scan-local route is gone', async () => {
    const kernel = testKernel()
    const app = createApp(kernel)
    const u = await bootstrapAdmin(app, kernel)
    const res = await app.request('/api/catalog/scan-local', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ak-session': u.token },
      body: JSON.stringify({ path: '/tmp' })
    })
    expect(res.status).toBe(404)
  })

  it('session expires_at is enforced', () => {
    const kernel = testKernel()
    const { token, ownerId } = kernel.registerPasswordUser({
      username: 'ttl',
      password: 'password-long-enough',
      bootstrap: true
    })
    expect(kernel.ownerFromToken(token)).toBe(ownerId)
    kernel.deps.db
      .prepare(`UPDATE sessions SET expires_at = ? WHERE token = ?`)
      .run(new Date(Date.now() - 60_000).toISOString(), token)
    expect(kernel.ownerFromToken(token)).toBeNull()
  })

  it('non-admin cannot mutate profiles', async () => {
    const kernel = testKernel()
    const app = createApp(kernel)
    await bootstrapAdmin(app, kernel)
    const op = insertOperator(kernel, 'operator-two')
    kernel.markExecutorPaired(op.ownerId)
    const create = await app.request('/api/profiles', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ak-session': op.token },
      body: JSON.stringify({
        id: 'evil',
        label: 'evil',
        rolePath: 'roles/x.md'
      })
    })
    expect(create.status).toBe(401)
  })
})
