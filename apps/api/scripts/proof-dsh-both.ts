import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdirSync as mk, writeFileSync as wf } from 'node:fs'
import { DshHostClient } from '../src/infrastructure/dsh/dsh-host-client.js'

const OUT = process.env.OUT || '/tmp/ak-proofs'
mkdirSync(OUT, { recursive: true })

async function smoke(label: string, endpoint: string, host: string) {
  const ws = join(tmpdir(), `ak-proof-${label}-${Date.now()}`)
  mk(ws, { recursive: true })
  wf(join(ws, 'README.md'), `# proof ${label}\n`)
  const c = new DshHostClient({ endpoint, trustedHost: host })
  const t0 = Date.now()
  await c.ping()
  const { sessionId } = await c.createSession(ws)
  await c.prompt(sessionId, `Proof ping from agent-kernel (${label}). Reply PONG.`)
  const list = await c.listSessions()
  const hist = await c.history(sessionId, { maxMessages: 50 })
  const result = {
    label,
    ok: true,
    endpoint,
    trustedHost: host,
    sessionId,
    ms: Date.now() - t0,
    sessionsListed: list.items.length,
    historyEvents: hist.events.length,
    at: new Date().toISOString(),
  }
  writeFileSync(join(OUT, `dsh-${label}-rpc.json`), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  return result
}

async function main() {
  const native = await smoke('native', 'http://127.0.0.1:3080', 'localhost:3080')
  const docker = await smoke('docker', 'http://127.0.0.1:13080', 'localhost:13080')
  writeFileSync(
    join(OUT, 'dsh-both-ok.json'),
    JSON.stringify({ native, docker, verdict: 'BOTH_OK' }, null, 2),
  )
}

main().catch((e) => {
  console.error(String(e))
  process.exit(1)
})
