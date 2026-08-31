/** Outbound executor job kinds — pushed over WSS; kernel never dials DSH. */
export type ExecutorJobKind =
  | 'start'
  | 'nudge'
  | 'fetch_transcript'
  | 'operator_turn'
  | 'list_workdir_candidates'


export type ExecutorJobStatus = 'pending' | 'claimed' | 'completed' | 'failed'

export type ExecutorJobRow = {
  id: string
  owner_id: string
  run_id: string
  kind: ExecutorJobKind
  status: ExecutorJobStatus
  payload_json: string
  result_json: string | null
  error_text: string | null
  created_at: string
  claimed_at: string | null
  completed_at: string | null
}

export type ExecutorJobView = {
  id: string
  runId: string
  kind: ExecutorJobKind
  payload: Record<string, unknown>
  createdAt: string
}
