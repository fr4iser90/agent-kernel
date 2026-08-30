#!/usr/bin/env node
/**
 * Headless Chromium screenshots of agent-kernel web UI (local :8080).
 * Usage: TOK=... node scripts/ui-screenshots.mjs
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const WEB = process.env.WEB || 'http://127.0.0.1:8080'
const API = process.env.API || 'http://127.0.0.1:8787'
const OUT = process.env.OUT || '/tmp/ak-ui-shots'
const CHROMIUM = process.env.CHROMIUM || 'chromium'

mkdirSync(OUT, { recursive: true })

async function json(path, init) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

async function getToken() {
  if (process.env.TOK) return process.env.TOK
  const cfg = await json('/api/auth/config')
  if (cfg.body.allowBootstrapRegister) {
    const r = await json('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'shotadmin', password: 'secret12345' }),
    })
    if (r.body.token) return r.body.token
  }
  const login = await json('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'password',
      username: process.env.AK_USER || 'shotadmin',
      password: process.env.AK_PASS || 'secret12345',
    }),
  })
  if (!login.body.token) {
    throw new Error(`login failed: ${JSON.stringify(login)}`)
  }
  return login.body.token
}

function shot(name, url, profileDir) {
  const out = join(OUT, `${name}.png`)
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    `--window-size=1440,900`,
    `--user-data-dir=${profileDir}`,
    `--screenshot=${out}`,
    url,
  ]
  const r = spawnSync(CHROMIUM, args, { encoding: 'utf8', timeout: 60000 })
  const ok = existsSync(out)
  console.log(JSON.stringify({ name, url, ok, status: r.status, err: (r.stderr || '').slice(-200) }))
  return ok
}

async function main() {
  const token = await getToken()
  console.log(JSON.stringify({ tokenPrefix: token.slice(0, 8) }))

  const profile = join(tmpdir(), `ak-chrome-${Date.now()}`)
  mkdirSync(profile, { recursive: true })

  // Seed cookie via Preferences is fragile; use a tiny HTML trampoline served... 
  // Better: set cookie with chromium DevTools Protocol — use --dump-dom after inject via URL.
  // Practical: write a cookie file for Chromium "Cookies" is sqlite encrypted.
  // Use CDP via chrome remote debugging:
  const debugPort = 19222
  const chrome = spawnSync(
    CHROMIUM,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { encoding: 'utf8', timeout: 2000, detached: true },
  )
  // detached won't work well with spawnSync. Use fetch CDP differently.
  // Simpler approach: proxy cookie via query to a local static injector — skip.
  // Use API x-ak-session header in UI? Cookie name?
  
  // Discover cookie name from Set-Cookie
  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'password',
      username: process.env.AK_USER || 'shotadmin',
      password: process.env.AK_PASS || 'secret12345',
    }),
  })
  const setCookie = loginRes.headers.getSetCookie?.() || []
  console.log(JSON.stringify({ setCookie, loginStatus: loginRes.status }))

  // Public pages first
  shot('01-home', `${WEB}/`, profile)
  shot('02-login', `${WEB}/login`, profile)

  // For authed pages: inject via local file that document.cookie then location=
  // Cookie Domain=localhost Path=/ — set via chromium --virtual-time-budget and data URL won't share origin.
  // Use HOST header trick: open WEB with cookie through Network.setCookie via CDP websocket.

  const pages = [
    ['03-overview', '/overview'],
    ['04-projects', '/projects'],
    ['05-agents', '/agents'],
    ['06-runs', '/runs'],
    ['07-settings', '/settings'],
    ['08-admin', '/admin'],
    ['09-chat', '/chat'],
  ]

  // Write a tiny CDP script using raw WebSocket is heavy. Fall back:
  // open each page with ?session= and hope — check if web reads x-ak-session from localStorage.
  writeFileSync(
    join(OUT, 'token.txt'),
    token,
  )

  // Use chromium with --load-extension style: evaluate via --run-all-compositor-stages-before-draw
  // Final pragmatic approach: curl HTML of public + use API to verify auth routes return JSON,
  // and screenshot login + home; for authed use cookie jar with firefox? 
  
  // CDP Network.setCookie via curl to /json/new
  const { spawn } = await import('node:child_process')
  const child = spawn(
    CHROMIUM,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}-cdp`,
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  await new Promise((r) => setTimeout(r, 1500))
  try {
    const ver = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((x) => x.json())
    const wsUrl = ver.webSocketDebuggerUrl
    console.log(JSON.stringify({ cdp: !!wsUrl }))
    const { default: WebSocket } = await import('ws').catch(() => ({ default: null }))
    if (!WebSocket) {
      console.log(JSON.stringify({ note: 'no ws package — public shots only' }))
    } else {
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl)
        let id = 0
        const send = (method, params) =>
          new Promise((res, rej) => {
            const mid = ++id
            const onMsg = (raw) => {
              const msg = JSON.parse(String(raw))
              if (msg.id === mid) {
                ws.off('message', onMsg)
                if (msg.error) rej(msg.error)
                else res(msg.result)
              }
            }
            ws.on('message', onMsg)
            ws.send(JSON.stringify({ id: mid, method, params }))
          })
        ws.on('open', async () => {
          try {
            await send('Network.enable', {})
            await send('Network.setCookie', {
              name: 'ak_session',
              value: token,
              url: WEB,
              path: '/',
            })
            await send('Network.setCookie', {
              name: 'ak-session',
              value: token,
              url: WEB,
              path: '/',
            })
            // also try common names after checking Set-Cookie
            for (const c of setCookie) {
              const name = c.split('=')[0]
              const value = c.split(';')[0].slice(name.length + 1)
              await send('Network.setCookie', { name, value, url: WEB, path: '/' })
            }
            for (const [name, path] of pages) {
              await send('Page.enable', {})
              await send('Page.navigate', { url: `${WEB}${path}` })
              await new Promise((r) => setTimeout(r, 1800))
              const { data } = await send('Page.captureScreenshot', { format: 'png' })
              writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'))
              console.log(JSON.stringify({ name, ok: true }))
            }
            resolve()
          } catch (e) {
            reject(e)
          } finally {
            ws.close()
          }
        })
        ws.on('error', reject)
      })
    }
  } catch (e) {
    console.log(JSON.stringify({ cdpError: String(e) }))
  } finally {
    child.kill('SIGKILL')
  }

  console.log(JSON.stringify({ out: OUT, done: true }))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
