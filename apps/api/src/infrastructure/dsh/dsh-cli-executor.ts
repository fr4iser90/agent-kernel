import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  ExecutorPort,
  ExecutorStartResult,
  ExecutorTranscript,
  SessionBrief,
} from '@agent-kernel/session-brief'

export type DshCliConfig = {
  cliRoot: string
  dshHome: string
}

/** Native DSH headless — real process, no Host HTTP, no fake. */
export class DshCliExecutor implements ExecutorPort {
  readonly id = 'dsh'

  constructor(private readonly cfg: DshCliConfig) {
    if (!cfg.cliRoot?.trim()) throw new Error('Settings.dshCliRoot required for dshInvokeMode=cli')
    if (!cfg.dshHome?.trim()) throw new Error('Settings.dshHome required for dshInvokeMode=cli')
    const hasTs = existsSync(join(cfg.cliRoot, 'apps/cli/src/bin.ts'))
    const hasJs = existsSync(join(cfg.cliRoot, 'apps/cli/lib/bin.js'))
    if (!hasTs && !hasJs) {
      throw new Error(`DSH CLI not found under ${cfg.cliRoot}/apps/cli`)
    }
  }

  private binArgs(task: string): { cmd: string; args: string[] } {
    const js = join(this.cfg.cliRoot, 'apps/cli/lib/bin.js')
    if (existsSync(js)) {
      return { cmd: process.execPath, args: [js, '--profile', 'headless', task] }
    }
    const ts = join(this.cfg.cliRoot, 'apps/cli/src/bin.ts')
    return {
      cmd: process.execPath,
      args: ['--import', 'tsx/esm', ts, '--profile', 'headless', task],
    }
  }

  private run(brief: SessionBrief, task: string): Promise<ExecutorStartResult> {
    if (brief.rolePromptText) {
      writeFileSync(join(brief.workdir, brief.agentsMdPath ?? 'AGENTS.md'), brief.rolePromptText)
    }
    const { cmd, args } = this.binArgs(task)
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd: brief.workdir,
        env: {
          ...process.env,
          DSH_HOME: this.cfg.dshHome,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d) => {
        stdout += String(d)
      })
      child.stderr.on('data', (d) => {
        stderr += String(d)
      })
      child.on('error', reject)
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`DSH CLI exit ${code}: ${stderr || stdout}`))
          return
        }
        resolve({ executorSessionId: `cli-${Date.now()}`, raw: { stdout, stderr } })
      })
    })
  }

  start(brief: SessionBrief): Promise<ExecutorStartResult> {
    const objective =
      brief.initialObjective?.trim() ||
      `Obey AGENTS.md / Lawpack. RUN_ID=${brief.runId}. Continue autonomous work.`
    return this.run(brief, objective)
  }

  async nudge(brief: SessionBrief, _id: string, text: string): Promise<void> {
    await this.run(
      brief,
      text.trim() || `Nudge: continue. RUN_ID=${brief.runId}. Obey AGENTS.md.`,
    )
  }

  getTranscript(_executorSessionId: string): Promise<ExecutorTranscript> {
    throw new Error(
      'DshCliExecutor does not support getTranscript — use host_http invoke mode for live session history',
    )
  }
}
