import { describe, expect, it } from 'vitest'
import { authorizeSessionStart } from '../src/application/policy-authorize.js'
import type { SessionBrief } from '@agent-kernel/session-brief'
import { DEFAULT_SETTINGS } from '../src/domain/settings/settings.js'

const brief = (over: Partial<SessionBrief> = {}): SessionBrief => ({
  projectId: 'p1',
  assignmentId: 'a1',
  executorId: 'dsh',
  workdir: '/executor/workdir/x',
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
  ...over
})

describe('policy-authorize', () => {
  it('denies uninitialized and allows initialized', () => {
    const deny = authorizeSessionStart({
      brief: brief(),
      projectStatus: 'registered',
      settings: DEFAULT_SETTINGS
    })
    expect(deny.allow).toBe(false)
    if (!deny.allow) expect(deny.code).toBe('project_not_initialized')

    const allow = authorizeSessionStart({
      brief: brief(),
      projectStatus: 'initialized',
      settings: DEFAULT_SETTINGS
    })
    expect(allow.allow).toBe(true)
  })

  it('requires ownedPathsFile when protectOwnedPaths and git policy on', () => {
    const unset = authorizeSessionStart({
      brief: brief(),
      projectStatus: 'initialized',
      settings: {
        ...DEFAULT_SETTINGS,
        gitPolicyEnabled: true,
        protectOwnedPaths: true,
        ownedPathsFile: null
      }
    })
    expect(unset.allow).toBe(false)
    if (!unset.allow) expect(unset.code).toBe('owned_paths_unset')

    const set = authorizeSessionStart({
      brief: brief(),
      projectStatus: 'initialized',
      settings: {
        ...DEFAULT_SETTINGS,
        gitPolicyEnabled: true,
        protectOwnedPaths: true,
        ownedPathsFile: 'OWNED.md'
      }
    })
    expect(set.allow).toBe(true)

    const policyOff = authorizeSessionStart({
      brief: brief(),
      projectStatus: 'initialized',
      settings: {
        ...DEFAULT_SETTINGS,
        gitPolicyEnabled: false,
        protectOwnedPaths: true,
        ownedPathsFile: null
      }
    })
    expect(policyOff.allow).toBe(true)
  })
})
