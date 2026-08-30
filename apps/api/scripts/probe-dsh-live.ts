import { DshHostClient } from '../src/infrastructure/dsh/dsh-host-client.js'

async function probe(label: string, endpoint: string, host: string) {
  const c = new DshHostClient({ endpoint, trustedHost: host })
  try {
    const list = await c.listSessions()
    console.log(
      JSON.stringify({
        label,
        ok: true,
        endpoint,
        host,
        sessions: list.items?.length ?? 0,
      }),
    )
  } catch (e) {
    console.log(JSON.stringify({ label, ok: false, endpoint, host, error: String(e) }))
  }
}

async function main() {
  await probe('native-3080', 'http://127.0.0.1:3080', 'localhost:3080')
  await probe('native-3080-iphost', 'http://127.0.0.1:3080', '127.0.0.1:3080')
  await probe('docker-13080', 'http://127.0.0.1:13080', 'localhost:13080')
  await probe('docker-13080-iphost', 'http://127.0.0.1:13080', '127.0.0.1:13080')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
