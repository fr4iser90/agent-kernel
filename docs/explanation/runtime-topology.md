# Runtime topology — Browser HTTPS, DSH outbound WSS, MCP tools separate

How **agent-kernel** talks to **DeepSeek Harness (DSH)** for BYO executors.

Related: [`integrations.md`](integrations.md), [`architecture.md`](architecture.md).

---

## What talks to what

```text
Browser ──HTTPS──▶ Kernel (REST + UI)
DSH Host plugin (agent-kernel-mcp) ──outbound WSS──▶ Kernel  /api/executor/ws
DSH Agent ──MCP stdio──▶ Kernel REST   (ak_* tools only)
```

| Channel | Direction | Role |
|---------|-----------|------|
| **HTTPS REST** | Browser → Kernel | UI, pair start, projects, runs |
| **WSS** | DSH → Kernel (outbound) | Jobs, heartbeat, transcript push — **control plane** |
| **MCP stdio** | Agent → Kernel HTTPS | Tools (`ak_nudge`, …) — **not** the job channel |

**No polling** of `/api/executor/jobs/claim`.  
**Kernel never dials** the user PC (no Host-HTTP reverse path, no SSH/VPN required for BYO).

---

## Pairing + WSS URL

1. Kernel UI: generate pair code (`POST /api/me/pair/start`).
2. DSH Header → Agent Kernel: Target URL + code → `POST /api/pair/claim` → writes `$DSH_HOME/agent-kernel/connect.json` `{ url, token }`.
3. Plugin opens `wss://<host>/api/executor/ws?token=<pair token>` (derive `wss` from `https`).
4. On connect: kernel marks `executorPaired`, heartbeat, may re-push pending jobs.
5. Nudge/start: kernel inserts job **and** pushes `{ type: "job.created", … }`. If no live socket → **fail loud**.

Auth: same session token as Bearer/`ak_session` from device pair.

---

## Traefik / deploy

WebSocket upgrade must reach the API (Traefik supports Upgrade by default on the router).  
Tune idle timeouts if heartbeats are sparse (plugin heartbeat ~25s). Sticky sessions not required for a single long-lived connection.

Env: `WEB_ORIGIN` / public HTTPS host; DSH derives `wss://` from that origin.

---

## Setup gaps

Per-user `UserExecutorSettings`: `executorId`, `executorPaired`, `operatorLlm`
(`executor` | `gateway`), optional `gatewayUrl` / `gatewayApiKey` (required when
`operatorLlm=gateway`).  
`setupGaps` = missing `executorId` / `executorPaired` only. No `connectMode` /
`dshEndpoint` / VPN fields.

### Operator chat LLM

| Mode | When | Behavior |
|------|------|----------|
| **`executor`** (default after pair) | BYO DSH online | Kernel enqueues `operator_turn` over WSS; DSH runs preset **`operator`** (deny shell/edit; MCP/kernel tools only) |
| **`gateway`** | Explicit choice + URL/key | OpenAI-compat GateWay tool loop on the kernel — chat without coding runtime |

No silent GateWay↔DSH fallback. Wrong/missing config fails loudly.

---

## Summary

- **Control plane:** DSH outbound WSS only.  
- **Tools:** MCP → HTTPS.  
- **Browser:** HTTPS to kernel UI/API.
