import type {
  ExecutorPort,
  ExecutorStartResult,
  ExecutorTranscript,
  SessionBrief,
} from '@agent-kernel/session-brief'
import { executorNotImplemented } from '../executor/not-implemented.js'

/**
 * In-process stub. Live path is outbound WSS jobs on the paired device
 * (agent-kernel-runner → `aider --message`).
 */
export class AiderExecutor implements ExecutorPort {
  readonly id = 'aider'

  start(_brief: SessionBrief): Promise<ExecutorStartResult> {
    return executorNotImplemented(this.id, 'start (use WSS device jobs)')
  }

  nudge(_brief: SessionBrief, _sid: string, _text: string): Promise<void> {
    return executorNotImplemented(this.id, 'nudge (use WSS device jobs)')
  }

  getTranscript(_sid: string): Promise<ExecutorTranscript> {
    return executorNotImplemented(this.id, 'getTranscript (use WSS device jobs)')
  }
}
