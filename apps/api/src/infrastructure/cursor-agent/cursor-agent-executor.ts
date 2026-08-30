import type {
  ExecutorPort,
  ExecutorStartResult,
  ExecutorTranscript,
  SessionBrief,
} from '@agent-kernel/session-brief'
import { executorNotImplemented } from '../executor/not-implemented.js'

/** Placeholder — `executorId: 'cursor-agent'` (Cursor CLI / agent). */
export class CursorAgentExecutor implements ExecutorPort {
  readonly id = 'cursor-agent'

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
