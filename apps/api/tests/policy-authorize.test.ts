import { describe, expect, it } from 'vitest'
import { authorizeSessionStart } from '../src/application/policy-authorize.js'
import type { SessionBrief } from '@agent-kernel/session-brief'
import { DEFAULT_SETTINGS } from '../src/domain/settings/settings.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const brief = (over: Partial<SessionBrief> = {}): SessionBrief => ({
  projectId: 'p1',
  assignmentId: 'a1',
  executorId: 'dsh',
  workdir: '/tmp/x',
  runId: 'agent/x',
  lawpackPin: null,
  injectionMode: 'harness_inject',
  rolesPath: null,
  agentsMdPath: 'AGENTS.md',
  gateCommand: null,
  ownedPathsRef: null,
  profileId: 'tracking-cycle',
  reviewMode: 'human',
  initialObjective: null,
  injectMaterialization: 'none',
  rolePromptText: null,
  ...over,
})

describe('policy-authorize', () => {
  it('denies uninitialized and allows initialized', () => {
    const deny = authorizeSessionStart({
      brief: brief(),
      projectStatus: 'registered',
      projectPathExists: true,
      projectLocalPath: '/tmp',
      settings: DEFAULT_SETTINGS,
    })
    expect(deny.allow).toBe(false)
    if (!deny.allow) expect(deny.code).toBe('project_not_initialized')

    const allow = authorizeSessionStart({
      brief: brief(),
      projectStatus: 'initialized',
      projectPathExists: true,
      projectLocalPath: '/tmp',
      settings: DEFAULT_SETTINGS,
    })
    expect(allow.allow).toBe(true)
  })

  it('enforces owned paths only when git policy on', () => {
    const root = join(tmpdir(), `ak-pol-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const off = authorizeSessionStart({
      brief: brief({ workdir: root }),
      projectStatus: 'initialized',
      projectPathExists: true,
      projectLocalPath: root,
      settings: {
        ...DEFAULT_SETTINGS,
        gitPolicyEnabled: true,
        protectOwnedPaths: true,
        ownedPathsFile: 'OWNED.md',
      },
    })
    expect(off.allow).toBe(false)

    writeFileSync(join(root, 'OWNED.md'), 'x\n')
    const on = authorizeSessionStart({
      brief: brief({ workdir: root }),
      projectStatus: 'initialized',
      projectPathExists: true,
      projectLocalPath: root,
      settings: {
        ...DEFAULT_SETTINGS,
        gitPolicyEnabled: true,
        protectOwnedPaths: true,
        ownedPathsFile: 'OWNED.md',
      },
    })
    expect(on.allow).toBe(true)
  })
})
