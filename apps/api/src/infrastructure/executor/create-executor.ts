import type { ExecutorPort } from '@agent-kernel/session-brief'
import { AiderExecutor } from '../aider/aider-executor.js'
import { ClaudeCodeExecutor } from '../claude-code/claude-code-executor.js'
import { CodexExecutor } from '../codex/codex-executor.js'
import { CursorAgentExecutor } from '../cursor-agent/cursor-agent-executor.js'
import { DshCliExecutor } from '../dsh/dsh-cli-executor.js'
import { DshExecutor } from '../dsh/dsh-executor.js'
import { DshHostClient } from '../dsh/dsh-host-client.js'
import { GooseExecutor } from '../goose/goose-executor.js'
import { OpenCodeExecutor } from '../opencode/opencode-executor.js'
import { PiExecutor } from '../pi/pi-executor.js'

/**
 * Registered executorIds.
 * `dsh` = implemented; all others = loud placeholders until their adapter is built.
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
  dshInvokeMode: 'cli' | 'host_http'
  dshEndpoint: string | null
  dshTrustedHost: string | null
  dshBasicAuthUser: string | null
  dshBasicAuthPassword: string | null
  dshCliRoot: string | null
  dshHome: string | null
}

/**
 * Build ExecutorPort by executorId.
 * Registry only — vendor wire code stays in each adapter folder.
 */
export function createExecutor(settings: ExecutorFactorySettings): ExecutorPort {
  switch (settings.executorId) {
    case 'dsh':
      if (settings.dshInvokeMode === 'cli') {
        return new DshCliExecutor({
          cliRoot: settings.dshCliRoot!,
          dshHome: settings.dshHome!,
        })
      }
      if (settings.dshInvokeMode === 'host_http') {
        return new DshExecutor(
          new DshHostClient({
            endpoint: settings.dshEndpoint!,
            trustedHost: settings.dshTrustedHost!,
            basicAuthUser: settings.dshBasicAuthUser,
            basicAuthPassword: settings.dshBasicAuthPassword,
          }),
        )
      }
      throw new Error(`Unknown dshInvokeMode=${settings.dshInvokeMode}`)
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
