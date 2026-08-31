import type { ExecutorPort } from '@agent-kernel/session-brief'
import { AiderExecutor } from '../aider/aider-executor.js'
import { ClaudeCodeExecutor } from '../claude-code/claude-code-executor.js'
import { CodexExecutor } from '../codex/codex-executor.js'
import { CursorAgentExecutor } from '../cursor-agent/cursor-agent-executor.js'
import { GooseExecutor } from '../goose/goose-executor.js'
import { OpenCodeExecutor } from '../opencode/opencode-executor.js'
import { PiExecutor } from '../pi/pi-executor.js'
import { executorNotImplemented } from './not-implemented.js'

/**
 * Registered executorIds.
 * Live coding path = outbound WSS jobs on the paired device
 * (DSH Host plugin or `agent-kernel-runner` for CLI executors).
 * `createExecutor` stubs stay for contract completeness — kernel does not dial the PC.
 */
export const EXECUTOR_IDS = [
  'dsh',
  'pi',
  'claude-code',
  'aider',
  'opencode',
  'goose',
  'codex',
  'cursor-agent',
] as const
export type ExecutorId = (typeof EXECUTOR_IDS)[number]

export type ExecutorFactorySettings = {
  executorId: string
}

/** Loud stub — kernel must enqueue jobs, not call ExecutorPort for DSH. */
class OutboundDshExecutor implements ExecutorPort {
  readonly id = 'dsh'
  start(): never {
    return executorNotImplemented('dsh', 'start (outbound job queue)')
  }
  nudge(): never {
    return executorNotImplemented('dsh', 'nudge (outbound job queue)')
  }
  getTranscript(): never {
    return executorNotImplemented('dsh', 'getTranscript (outbound job queue)')
  }
}

/**
 * Build ExecutorPort by executorId.
 * DSH never dials Host HTTP from the kernel.
 */
export function createExecutor(settings: ExecutorFactorySettings): ExecutorPort {
  switch (settings.executorId) {
    case 'dsh':
      return new OutboundDshExecutor()
    case 'pi':
      return new PiExecutor()
    case 'claude-code':
      return new ClaudeCodeExecutor()
    case 'aider':
      return new AiderExecutor()
    case 'opencode':
      return new OpenCodeExecutor()
    case 'goose':
      return new GooseExecutor()
    case 'codex':
      return new CodexExecutor()
    case 'cursor-agent':
      return new CursorAgentExecutor()
    default:
      throw new Error(
        `Unsupported executorId=${settings.executorId}. Known: ${EXECUTOR_IDS.join(', ')}`,
      )
  }
}
