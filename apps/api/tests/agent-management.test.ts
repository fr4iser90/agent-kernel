import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { Kernel } from '../src/application/kernel.js'
import { openSqlite } from '../src/infrastructure/sqlite/db.js'
import { SqliteProjectRepository } from '../src/infrastructure/sqlite/project-repository.js'
import { SqliteSettingsRepository } from '../src/infrastructure/sqlite/settings-repository.js'
import { createApp } from '../src/presentation/app.js'

function harness() {
  const db = openSqlite(':memory:')
  const projects = new SqliteProjectRepository(db)
  const settingsRepo = new SqliteSettingsRepository(db)
  const kernel = new Kernel({
    db,
    projects,
    settingsRepo,
    repoRoot: join(process.cwd(), '..', '..')
  })
  return { kernel, projects, app: createApp(kernel) }
}

async function adminToken(
  app: ReturnType<typeof createApp>,
  kernel: Kernel,
) {
  const reg = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'secret123' })
  })
  const { token } = (await reg.json()) as { token: string }
  return token
}

function makeInitializedProject(
  kernel: Kernel,
  projects: SqliteProjectRepository,
  ownerId: string,
  name: string,
) {
  const p = kernel.registerProject(ownerId, {
    name,
    localPath: `/executor/workdir/${name}`
  })
  return projects.update({
    ...p,
    status: 'initialized',
    lawpackVersion: '0.0.0',
    meta: { injectionMode: 'harness_inject', gateCommand: 'pnpm test' },
    updatedAt: new Date().toISOString()
  })
}

function fillExecutor(kernel: Kernel, ownerId: string) {
  kernel.markExecutorPaired(ownerId)
}

describe('agent management CRUD', () => {
  it('profile create / update / delete + assignment full cycle', async () => {
    const { kernel, projects, app } = harness()
    const token = await adminToken(app, kernel)
    const hdr = { 'content-type': 'application/json', 'x-ak-session': token }
    const me = await app.request('/api/auth/me', { headers: hdr })
    const { ownerId } = (await me.json()) as { ownerId: string }
    const project = makeInitializedProject(kernel, projects, ownerId, 'demo')

    const createProf = await app.request('/api/profiles', {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({
        id: 'custom-cycle',
        label: 'Custom cycle',
        rolePath: 'roles/followup.md'
      })
    })
    expect(createProf.status).toBe(201)
    expect(((await createProf.json()) as { profile: { id: string } }).profile.id).toBe(
      'custom-cycle',
    )

    const assign = await app.request(`/api/projects/${project.id}/assignments`, {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({
        profileId: 'custom-cycle',
        scheduleMode: 'manual',
        reviewMode: 'human'
      })
    })
    expect(assign.status).toBe(201)
    const { assignment } = (await assign.json()) as { assignment: { id: string } }

    const patch = await app.request(`/api/assignments/${assignment.id}`, {
      method: 'PATCH',
      headers: hdr,
      body: JSON.stringify({ scheduleMode: 'infinite', paused: true })
    })
    expect(patch.status).toBe(200)
    expect(
      ((await patch.json()) as { assignment: { schedule_mode: string } }).assignment.schedule_mode,
    ).toBe('infinite')

    const delProfBusy = await app.request('/api/profiles/custom-cycle', {
      method: 'DELETE',
      headers: hdr
    })
    expect(delProfBusy.status).toBeGreaterThanOrEqual(400)

    const delAssign = await app.request(`/api/assignments/${assignment.id}`, {
      method: 'DELETE',
      headers: hdr
    })
    expect(delAssign.status).toBe(200)

    const delProf = await app.request('/api/profiles/custom-cycle', {
      method: 'DELETE',
      headers: hdr
    })
    expect(delProf.status).toBe(200)
  })

  it('global assignment requires fanOut; policy blocks uninitialized', async () => {
    const { kernel, app } = harness()
    const token = await adminToken(app, kernel)
    const hdr = { 'content-type': 'application/json', 'x-ak-session': token }
    const me = await app.request('/api/auth/me', { headers: hdr })
    const { ownerId } = (await me.json()) as { ownerId: string }
    fillExecutor(kernel, ownerId)

    const bad = await app.request('/api/assignments', {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({
        profileId: 'tracking-cycle',
        scheduleMode: 'manual',
        reviewMode: 'human'
      })
    })
    expect(bad.status).toBeGreaterThanOrEqual(400)

    const ok = await app.request('/api/assignments', {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({
        profileId: 'tracking-cycle',
        scheduleMode: 'manual',
        reviewMode: 'human',
        fanOut: { mode: 'all_initialized' }
      })
    })
    expect(ok.status).toBe(201)

    const p = kernel.registerProject(ownerId, {
      name: 'uninit',
      localPath: '/executor/workdir/uninit'
    })
    const a = kernel.createAssignment({
      ownerId,
      projectId: p.id,
      profileId: 'tracking-cycle',
      scheduleMode: 'manual',
      reviewMode: 'human'
    })!
    await expect(kernel.nudge(ownerId, String(a.id))).rejects.toThrow(/not initialized/i)
  })

  it('llm_auto starts executor immediately (no human gate)', async () => {
    const { kernel, projects, app } = harness()
    const token = await adminToken(app, kernel)
    const hdr = { 'content-type': 'application/json', 'x-ak-session': token }
    const me = await app.request('/api/auth/me', { headers: hdr })
    const { ownerId } = (await me.json()) as { ownerId: string }
    fillExecutor(kernel, ownerId)
    const project = makeInitializedProject(kernel, projects, ownerId, 'rev')
    // Point at live docker DSH if present — otherwise expect loud connection error.
    kernel.markExecutorPaired(ownerId)
    const a = kernel.createAssignment({
      ownerId,
      projectId: project.id,
      profileId: 'tracking-cycle',
      scheduleMode: 'manual',
      reviewMode: 'llm_auto'
    })!
    try {
      const run = (await kernel.nudge(ownerId, String(a.id))) as { outcome: string }
      expect(['running', 'completed']).toContain(run.outcome)
    } catch (e) {
      expect(String(e)).toMatch(/DSH|ECONNREFUSED|connect|fetch|HTTP/i)
    }
  })

  it('llm_propose queues awaiting_review without executor', async () => {
    const { kernel, projects, app } = harness()
    const token = await adminToken(app, kernel)
    const hdr = { 'content-type': 'application/json', 'x-ak-session': token }
    const me = await app.request('/api/auth/me', { headers: hdr })
    const { ownerId } = (await me.json()) as { ownerId: string }
    fillExecutor(kernel, ownerId)
    const project = makeInitializedProject(kernel, projects, ownerId, 'propose')
    const a = kernel.createAssignment({
      ownerId,
      projectId: project.id,
      profileId: 'tracking-cycle',
      scheduleMode: 'manual',
      reviewMode: 'llm_propose'
    })!
    const run = (await kernel.nudge(ownerId, String(a.id))) as { id: string; outcome: string }
    expect(run.outcome).toBe('awaiting_review')

    const rej = await app.request(`/api/runs/${run.id}/reject`, {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({ reason: 'nope' })
    })
    expect(rej.status).toBe(200)
    expect(((await rej.json()) as { run: { outcome: string } }).run.outcome).toBe('rejected')
  })
})
