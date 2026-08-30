#!/usr/bin/env node
/** Local basic-auth reverse proxy → DSH (proves Traefik-style path without remote). */
import http from 'node:http'
import { request as httpRequest } from 'node:http'

const LISTEN = Number(process.env.PROXY_PORT || 13081)
const UP = process.env.UPSTREAM || 'http://127.0.0.1:13080'
const USER = process.env.PROXY_USER || 'ak'
const PASS = process.env.PROXY_PASS || 'secret'
const TRUSTED = process.env.TRUSTED_HOST || `localhost:${LISTEN}`

const server = http.createServer((req, res) => {
  const auth = req.headers.authorization || ''
  const expect = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64')
  if (auth !== expect) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm=dsh' })
    res.end('unauthorized')
    return
  }
  const u = new URL(req.url || '/', UP)
  const headers = { ...req.headers, host: new URL(UP).host }
  delete headers['authorization']
  const preq = httpRequest(
    {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: req.method,
      headers: { ...headers, Host: new URL(UP).host },
    },
    (pres) => {
      res.writeHead(pres.statusCode || 500, pres.headers)
      pres.pipe(res)
    },
  )
  preq.on('error', (e) => {
    res.writeHead(502)
    res.end(String(e))
  })
  req.pipe(preq)
})

server.listen(LISTEN, '127.0.0.1', () => {
  console.log(`basic-auth proxy ${LISTEN} → ${UP} trusted=${TRUSTED} user=${USER}`)
})
