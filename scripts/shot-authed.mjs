#!/usr/bin/env node
/** Authed UI screenshots via CDP + Node native WebSocket (no extra deps). */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const WEB = 'http://127.0.0.1:8080'
const OUT = '/tmp/ak-proofs'
const TOK = process.env.TOK
const PORT = 19244
const profile = '/tmp/ak-chrome-cdp2'
mkdirSync(OUT, { recursive: true })
try {
  rmSync(profile, { recursive: true, force: true })
} catch {
  /* ignore */
}

if (!TOK) {
  console.error('TOK required')
  process.exit(1)
}

const child = spawn(
  'chromium',
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

await new Promise((r) => setTimeout(r, 1500))

function cdpSession(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data))
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) rej(new Error(JSON.stringify(msg.error)))
        else res(msg.result)
      }
    })
    ws.addEventListener('open', () => resolve({ ws, send }))
    ws.addEventListener('error', reject)
    function send(method, params = {}) {
      const mid = ++id
      return new Promise((res, rej) => {
        pending.set(mid, { resolve: res, reject: rej })
        ws.send(JSON.stringify({ id: mid, method, params }))
      })
    }
  })
}

try {
  const ver = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json())
  const { ws, send } = await cdpSession(ver.webSocketDebuggerUrl)
  await send('Network.enable')
  await send('Network.setCookie', {
    name: 'ak_session',
    value: TOK,
    url: WEB,
    path: '/',
  })
  const pages = [
    ['ak-overview', '/overview'],
    ['ak-projects', '/projects'],
    ['ak-agents', '/agents'],
    ['ak-runs', '/runs'],
    ['ak-settings', '/settings'],
    ['ak-admin', '/admin'],
    ['ak-chat', '/chat'],
    ['ak-setup', '/setup'],
  ]
  for (const [name, path] of pages) {
    await send('Page.enable')
    await send('Page.navigate', { url: `${WEB}${path}` })
    await new Promise((r) => setTimeout(r, 2500))
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    const file = join(OUT, `${name}.png`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    console.log(JSON.stringify({ name, ok: existsSync(file) }))
  }
  ws.close()
} catch (e) {
  console.error(String(e))
  process.exitCode = 1
} finally {
  child.kill('SIGKILL')
}
