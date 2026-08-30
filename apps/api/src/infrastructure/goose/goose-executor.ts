import type {
  ExecutorPort,
  ExecutorStartResult,
  ExecutorTranscript,
  SessionBrief,
} from '@agent-kernel/session-brief'
import { executorNotImplemented } from '../executor/not-implemented.js'

/** Placeholder — `executorId: 'goose'` (Block Goose). */
export class GooseExecutor implements ExecutorPort {
  readonly id = 'goose'

  start(_brief: SessionBrief): Promise<ExecutorStartResult> {
    return executorNotImplemented(this.id, 'start')
  }

  nudge(_brief: SessionBrief, _sid: string, _text: string): Promise<void> {
    return executorNotImplemented(this.id, 'nudge')
  }

  getTranscript(_sid: string): Promise<ExecutorTranscript> {
    return executorNotImplemented(this.id, 'getTranscript')
  }
}
