export type InjectMaterialization =
  | 'ephemeral_dir'
  | 'dot_agent'
  | 'prompt_inline'
  | 'none'

export type SessionBrief = {
  projectId: string
  assignmentId: string
  executorId: string
  /** Executor workdir path (opaque to kernel). */
  workdir: string
  /** Path passed to executor session.create. Defaults to workdir. */
  executorCwd?: string | null
  runId: string
  lawpackPin: string | null
  injectionMode: 'harness_inject' | 'repo_plant'
  rolesPath: string | null
  agentsMdPath: string | null
  gateCommand: string | null
  ownedPathsRef: string | null
  profileId: string
  reviewMode: 'human' | 'llm_propose' | 'llm_auto'
  initialObjective: string | null
  injectMaterialization: InjectMaterialization
  rolePromptText: string | null
}

export type ExecutorStartResult = {
  executorSessionId: string
  raw?: unknown
}

/** Generic control-plane transcript — executor adapters map their wire format into this. */
export type TranscriptMessage = {
  seq: number
  time: number
  role: 'user' | 'assistant' | 'system' | 'tool' | 'event'
  type: string
  text: string
  toolView?: unknown
}

export type TranscriptFileOp = {
  seq: number
  time: number
  tool: string
  path: string | null
  summary: string
  view?: unknown
}

export type ExecutorSessionSnapshot = {
  sessionId: string
  running: boolean
  blank: boolean
  cwd: string | null
  title: string | null
  updatedAt: number
  agentPreset?: string | null
}

export type ExecutorTranscript = {
  session: ExecutorSessionSnapshot
  messages: TranscriptMessage[]
  fileOps: TranscriptFileOp[]
  /** Opaque executor-native event log for debugging / future adapters. */
  rawEvents: unknown[]
  meta: {
    historyPages: number
    eventCount: number
  }
}

/**
 * Coding executor port (DSH, PI, …). Kernel only talks through this.
 * Adapters MUST implement getTranscript for their own session protocol — no silent empty returns.
 */
export interface ExecutorPort {
  readonly id: string
  start(brief: SessionBrief): Promise<ExecutorStartResult>
  nudge(brief: SessionBrief, executorSessionId: string, text: string): Promise<void>
  getTranscript(executorSessionId: string): Promise<ExecutorTranscript>
}
