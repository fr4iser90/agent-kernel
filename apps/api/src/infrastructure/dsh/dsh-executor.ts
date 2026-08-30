import type {
  ExecutorPort,
  ExecutorStartResult,
  ExecutorTranscript,
  SessionBrief,
} from '@agent-kernel/session-brief'
import { DshHostClient } from './dsh-host-client.js'
import { mapHistoryToTranscript } from './map-history.js'

/** DeepSeek Harness Host HTTP → ExecutorPort. */
export class DshExecutor implements ExecutorPort {
  readonly id = 'dsh'

  constructor(private readonly client: DshHostClient) {}

  async start(brief: SessionBrief): Promise<ExecutorStartResult> {
    const { sessionId } = await this.client.createSession(brief.executorCwd ?? brief.workdir)
    const roleBlock = brief.rolePromptText
      ? `\n\n---\n# Role / Lawpack (injected)\n\n${brief.rolePromptText}\n---\n`
      : ''
    const objective =
      brief.initialObjective?.trim() ||
      `Obey Lawpack / AGENTS.md. RUN_ID=${brief.runId}. Continue autonomous work.`
    await this.client.prompt(sessionId, `${objective}${roleBlock}`)
    return { executorSessionId: sessionId }
  }

  async nudge(brief: SessionBrief, executorSessionId: string, text: string): Promise<void> {
    const msg =
      text.trim() ||
      `Nudge: continue. RUN_ID=${brief.runId}. Obey pinned Lawpack / AGENTS.md.`
    await this.client.prompt(executorSessionId, msg)
  }

  async getTranscript(executorSessionId: string): Promise<ExecutorTranscript> {
    if (!executorSessionId.trim()) {
      throw new Error('DshExecutor.getTranscript requires executorSessionId')
    }
    const [{ events, pages }, listed] = await Promise.all([
      this.client.historyAll(executorSessionId),
      this.client.listSessions(),
    ])
    const summary = listed.items.find((i) => i.sessionId === executorSessionId)
    if (!summary) {
      throw new Error(
        `executor session not in session.list: ${executorSessionId} (gone or wrong host)`,
      )
    }
    const { messages, fileOps } = mapHistoryToTranscript(events)
    return {
      session: {
        sessionId: summary.sessionId,
        running: summary.running,
        blank: summary.blank,
        cwd: summary.cwd ?? null,
        title:
          typeof summary.projections?.values?.title === 'string'
            ? summary.projections.values.title
            : null,
        updatedAt: summary.updatedAt,
        agentPreset: summary.agentPreset ?? null,
      },
      messages,
      fileOps,
      rawEvents: events,
      meta: { historyPages: pages, eventCount: events.length },
    }
  }
}
