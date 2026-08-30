/**
 * Map DeepSeek Harness session.history wire → ExecutorTranscript.
 * Lives only under infrastructure/dsh — other executors have their own mappers.
 */

import type { TranscriptFileOp, TranscriptMessage } from '@agent-kernel/session-brief'

export type HistoryEntry = {
  event: { type: string; seq: number; time: number; data: unknown }
  view?: unknown
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function textFromBlocks(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!isRecord(block)) continue
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n').trim()
}

function messageText(data: unknown): string {
  if (!isRecord(data)) return ''
  if (isRecord(data.message)) return textFromBlocks(data.message.content)
  return textFromBlocks(data.content)
}

function toolName(data: unknown): string | null {
  if (!isRecord(data)) return null
  if (typeof data.name === 'string') return data.name
  if (typeof data.tool === 'string') return data.tool
  if (isRecord(data.call) && typeof data.call.name === 'string') return data.call.name
  return null
}

function toolPath(data: unknown): string | null {
  if (!isRecord(data)) return null
  const candidates = [data.path, data.file, data.filePath, data.target]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c
  }
  if (isRecord(data.input)) {
    for (const k of ['path', 'file', 'file_path', 'filePath', 'target']) {
      const v = data.input[k]
      if (typeof v === 'string' && v.trim()) return v
    }
  }
  if (isRecord(data.args)) {
    for (const k of ['path', 'file', 'file_path', 'filePath', 'target']) {
      const v = data.args[k]
      if (typeof v === 'string' && v.trim()) return v
    }
  }
  return null
}

export function mapHistoryToTranscript(entries: HistoryEntry[]): {
  messages: TranscriptMessage[]
  fileOps: TranscriptFileOp[]
} {
  const messages: TranscriptMessage[] = []
  const fileOps: TranscriptFileOp[] = []

  for (const entry of entries) {
    const { event, view } = entry
    const t = event.type
    if (t === 'user/message') {
      const text = messageText(event.data)
      if (text) {
        messages.push({
          seq: event.seq,
          time: event.time,
          role: 'user',
          type: t,
          text,
        })
      }
      continue
    }
    if (t === 'assistant/message') {
      const text = messageText(event.data)
      if (text) {
        messages.push({
          seq: event.seq,
          time: event.time,
          role: 'assistant',
          type: t,
          text,
        })
      }
      continue
    }
    if (t === 'assistant/chunk') {
      continue
    }
    if (t === 'tool/call' || t === 'tool/result') {
      const name = toolName(event.data) ?? t
      const path = toolPath(event.data)
      const text = messageText(event.data) || `${name}${path ? ` · ${path}` : ''}`
      messages.push({
        seq: event.seq,
        time: event.time,
        role: 'tool',
        type: t,
        text,
        toolView: view,
      })
      if (path || view) {
        fileOps.push({
          seq: event.seq,
          time: event.time,
          tool: name,
          path,
          summary: text.slice(0, 400),
          view,
        })
      }
      continue
    }
    if (t === 'turn/end' || t === 'turn/start' || t === 'session/title') {
      const title =
        isRecord(event.data) && typeof event.data.title === 'string' ? event.data.title : null
      messages.push({
        seq: event.seq,
        time: event.time,
        role: 'event',
        type: t,
        text: title ?? t,
      })
    }
  }

  return { messages, fileOps }
}
