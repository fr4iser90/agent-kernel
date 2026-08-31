import type { SessionBrief } from '@agent-kernel/session-brief'
import type { AgentKernelSettings } from '../domain/settings/settings.js'

export type PolicyDecision =
  | { allow: true }
  | { allow: false; code: string; reason: string }

/**
 * In-process start authorization before ExecutorPort.
 * Project workdir lives on the executor — kernel never existsSync's product trees.
 */
export function authorizeSessionStart(input: {
  brief: SessionBrief
  projectStatus: string
  settings: Pick<
    AgentKernelSettings,
    'gitPolicyEnabled' | 'protectAssertRunId' | 'forbidRunIdForkSuffixes' | 'protectOwnedPaths' | 'ownedPathsFile'
  >
}): PolicyDecision {
  const { brief, settings } = input

  if (input.projectStatus !== 'initialized') {
    return {
      allow: false,
      code: 'project_not_initialized',
      reason: `project ${brief.projectId} is not initialized — run Init before starting an agent`,
    }
  }
  if (!['human', 'llm_propose', 'llm_auto'].includes(brief.reviewMode)) {
    return {
      allow: false,
      code: 'bad_review_mode',
      reason: `invalid reviewMode=${brief.reviewMode}`,
    }
  }
  if (!brief.workdir?.trim()) {
    return { allow: false, code: 'workdir_required', reason: 'SessionBrief.workdir required (executor path)' }
  }
  if (!brief.executorId?.trim()) {
    return { allow: false, code: 'executor_required', reason: 'SessionBrief.executorId required' }
  }
  if (!brief.runId?.trim()) {
    return { allow: false, code: 'run_id_required', reason: 'SessionBrief.runId required' }
  }

  if (!settings.gitPolicyEnabled) {
    return { allow: true }
  }

  if (settings.protectAssertRunId) {
    for (const suf of settings.forbidRunIdForkSuffixes) {
      if (brief.runId.includes(suf)) {
        return {
          allow: false,
          code: 'run_id_forbidden_suffix',
          reason: `runId forbidden suffix ${suf}`,
        }
      }
    }
  }

  if (settings.protectOwnedPaths && !settings.ownedPathsFile?.trim()) {
    return {
      allow: false,
      code: 'owned_paths_unset',
      reason: 'protectOwnedPaths enabled but ownedPathsFile not set',
    }
  }

  return { allow: true }
}

export function assertPolicyAllowed(decision: PolicyDecision): void {
  if (!decision.allow) {
    throw new Error(`${decision.code}: ${decision.reason}`)
  }
}
