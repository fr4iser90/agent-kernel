# UI — pages, dashboard, style

Product surface for **agent-kernel**: a **project control plane**. You *do*
talk to it (operator chat) — you do **not** rebuild a coding IDE chat like
PIDEA ([`naming.md`](../reference/naming.md)).

Deploy context: [`runtime-topology.md`](runtime-topology.md).  
How chat / orchestrator talk to DSH: section **Operator chat** below +
[`integrations.md`](integrations.md).

---

## Job of the web app

Answer in one glance:

1. Which **projects** do I manage?  
2. Are they **initialized** / healthy (gate, bugs, branch)?  
3. Which **agents** are assigned, on what **schedule**?  
4. Can I **start / nudge / stop** a run (and see last Brief)?  
5. Can I **ask the control plane** in natural language (status, nudge, assign)?

DSH Web UI remains optional for watching the *coding* loop. This app steers
and observes; it does not mirror an IDE file tree/terminal.

---

## Two different “chats” (important)

| Chat | Where | Who you talk to | Does what |
|------|--------|-----------------|-----------|
| **Operator chat** | agent-kernel Web | Control plane / orchestrator (LLM + **tools** on our API) | Status, Init hints, assign profile, nudge, “what’s red?” |
| **Coding chat** | DSH (Web/CLI/session) | Product coding agent | Edits code, runs gate, commits on RUN_ID |

**PIDEA mistake:** one mega-chat that *is* the IDE.  
**Here:** operator chat is a **remote control + advisor** over catalog /
profiles / orchestration. Coding stays in DSH. Operator chat may *trigger*
a DSH session or paste a Brief — it does not stream every tool call as an
IDE transcript.

### Scopes for operator chat

| Scope | Example | Tools / context |
|-------|---------|-----------------|
| **Projects overview** (default on Overview) | “Which gates are red?” | list projects, health widgets, global assignments |
| **Project** (on project detail) | “Nudge tracking-cycle”, “Show brief” | this `projectId` only + its assignments |
| **Orchestrator** | “Pause all infinite runs”, “Global security cron” | assignments, runs, schedules |
| **Deep link to DSH** | “Open / start Followup session” | API start policy → DSH start/attach (no coding inside kernel chat) |

LLM for operator chat = **LocalAI-GateWay** (control-plane keys).  
Coding tokens stay on the DSH → GateWay path.

### How the orchestrator is reached (no mystery bus)

```text
You ──typed message──► agent-kernel chat API
                         │
                         ├─ LLM (GateWay) chooses tool calls
                         │
                         ├─ tools ──► Catalog / Profiles / Assignments
                         │         ──► Orchestration (nudge, pause, brief)
                         │         ──► Observability (gate/bugs summary)
                         │
                         └─ tools ──► API start policy ──► ExecutorPort
                                              (start/nudge session only)
```

So “talk to the orchestrator” = chat whose **tool backend is our own API**,
not a second agent inventing side channels. UI buttons and chat call the
**same** application services.

---

## Information architecture (pages)

Keep the nav small. Prefer **one shell + routes**, not a mega-sidebar of empty
rooms.

| Route | UI label | Purpose | Priority |
|-------|----------|---------|----------|
| `/login` | **Login** | Authenticate; hard gate before any operator surface | Product entry (remote required; local may auto `local-owner` until M6) |
| `/` | **Overview** | Cross-project status (attention, widgets) + overview chat | After auth |
| `/projects` | **Projects** | List + register | Now (exists, merge into shell) |
| `/projects/:id` | **Project** | Detail + **project-scoped chat** | Next |
| `/projects/:id/init` | **Initialize** | Wizard (sniff → plant → assign) | Now (inline; promote to route) |
| `/agents` | **Agents** | Profile library + global assignments | Now (panel → page) |
| `/runs` | **Runs** | Run history / nudge log / session ids | M4 |
| `/chat` | **Chat** | Optional full-height operator chat (overview / orchestrator scope) | After tools exist |
| `/settings` | **Settings** | Full schema — page wireframe: [`settings-ui.md`](settings-ui.md); keys: [`settings.md`](../reference/settings.md) | Spec done; implement M3 |

**Out of scope for web v1**

- Full markdown editors for PROGRESS/BUGS (link/open path or short preview)  
- **Coding** chat / tool transcript inside kernel (that’s DSH)  
- IDE / file tree / terminal mirror  
- Multi-tenant admin consoles  

Optional later: `/knowledge` (codegraph) only when M5 is real.

### Project detail — sections (one page, scroll or tabs)

1. **Header** — name, path/remote, status badge, Lawpack version  
2. **Health** — gate / bugs open / branch / last run (widgets)  
3. **Agents** — assignments: profile, schedule, reviewMode, Brief dry-run, Nudge  
4. **Provisioning** — re-sniff, protect/assert status, Init if not done  
5. **Meta** — stack, gate command, workspaces (monorepo picker when needed)  
6. **Chat** — dock or tab: project-scoped operator chat

---

## Dashboard (Overview) — how it should feel

**One job:** cross-project health and attention for managed projects and agents —
not a second IDE.

### Layout sketch

```text
┌─────────────────────────────────────────────────────────┐
│  agent-kernel          Overview · Projects · Agents     │
├─────────────────────────────────────────────────────────┤
│  Attention strip (only if something is wrong)           │
│  e.g. 2× gate red · 1× infinite agent idle · protect ✗  │
├──────────────┬──────────────┬───────────────────────────┤
│ Gate         │ BUGS Open    │ Branch / RUN_ID           │
│ green/red    │ count + top  │ tip sync?                 │
├──────────────┼──────────────┼───────────────────────────┤
│ Last run     │ Schedule     │ Security (optional)       │
│ outcome      │ next cron    │ last scan                 │
├──────────────┴──────────────┴───────────────────────────┤
│ Projects needing action (uninit / no agent / red gate)  │
└─────────────────────────────────────────────────────────┘
```

### Widgets (configurable — M3)

| Widget | Data | Interaction |
|--------|------|-------------|
| Gate | adapter gate or last known | open project / re-check |
| BUGS Open | parse `BUGS.md` or API cache | open project |
| Branch / RUN_ID | git tip vs PROGRESS | — |
| Last run | Orchestration | open run / Brief |
| Schedule | next nudge per assignment | pause / run now |
| Protect | assert-run-id + owned-paths | re-verify |
| Security | AgentLayer job (later) | — |
| Codegraph | status only (M5) | — |

User picks which widgets show; layout persisted (Observability preferences).

**Cards:** only as widget chrome / click targets. No card spam in heroes.
Empty dashboard = short CTA (“Register first project”), not a wall of
placeholders.

---

## Features the web must cover (checklist)

### Already roughly there

- [x] Register project (path, optional remote)  
- [x] Sniff metadata display  
- [x] Init wizard (Lawpack + profile + schedule)  
- [x] Profile library list  
- [x] Assignments list + global assign  
- [x] SessionBrief dry-run  

### Needed next (make the product usable daily)

- [x] App shell + routing (Overview / Projects / Agents)  
- [x] **Project detail page** (not only a flat list)  
- [x] Protect/assert **green/red** on project + overview  
- [ ] Monorepo: choose workspace package at Init  
- [x] Assignment edit / pause / delete
- [x] **Nudge now** + last run status (even if CLI-backed at first)
- [x] Attention strip on Overview
- [ ] **Operator chat** (overview + project + orchestrator scope) with tools on the same API

### Needed for “agents really run” (M4)

- [x] Runs page (session id, outcome, link to Brief)
- [x] Schedule controls that match executor (infinite / cron / manual)
- [x] Settings: DSH endpoint / workspace root / connect modes
- [x] Start policy in API before ExecutorPort (no sidecar)
- [ ] Chat tool: start/attach DSH via API (same start policy as buttons)
- [x] LLM review mode UI (`llm_propose` approve/reject)

### Later

- [ ] Widget layout editor
- [ ] BUGS/PROGRESS preview
- [x] Login as Web UI entry (`/login`); remote requires real auth
- [ ] Codegraph page (M5)
- [ ] Optional `/chat` full page + streamed tool traces (ops, not IDE)

## Visual style

**Stay close to the current scaffold** — it already avoids generic “AI purple”
and cream/serif-terracotta clichés:

| Token | Direction |
|-------|-----------|
| Mood | Dark ops console, calm, dense but readable |
| BG | Charcoal + soft cool radial (`#0e1014` / `#1a2430`) |
| Accent | Mint/teal signal (`#6ec8a0`) for OK / primary actions |
| Danger | Muted red for gate fail / blockers (`#e07070`) |
| Type | **IBM Plex Sans** UI + **IBM Plex Serif** sparingly for titles |
| Chrome | Thin borders, soft panels; few radii; no glow stacks |
| Motion | Subtle: status flash, wizard step enter — not confetti |

**Do**

- Status as color + short text (`gate ok`, `3 open`) — not only icons  
- Brand “agent-kernel” visible in shell (eyebrow / wordmark)  
- English UI copy in docs and default app; keep Lawpack / RUN_ID / SessionBrief as product terms  

**Don’t**

- Chat **as the only** home screen (dashboard first; chat docks beside / on detail)  
- Streaming a full DSH coding transcript inside kernel (link out / open DSH)  
- Dashboard of 20 empty metric pills  
- Light marketing landing as the authenticated app shell  
- Purple gradients, neon glassmorphism, emoji navigation  

Mobile: usable list + detail; widget grid collapses to a stack. Primary use is
desktop (local ops).

---

## UX principles (short)

1. **Configure + chat here, code in DSH** — operator chat steers; coding chat stays in the harness.  
2. **Buttons and chat share tools** — no side channel the UI cannot also click.  
3. **Deterministic first** — wizard fields editable; LLM later as “suggestion”.  
4. **One primary action per view** — e.g. project list → Init or open detail.  
5. **Red means act** — attention strip only when something is wrong.  
6. **Same IA local and server** — Settings swap endpoints/paths, not page trees
   ([`runtime-topology.md`](runtime-topology.md)).

---

## Build order (UI-focused)

1. Shell + routes + project detail  
2. Protect/assert indicators  
3. Overview with attention + 3–4 fixed widgets  
4. Nudge / Runs wired to executor  
5. Widget layout prefs  
6. Settings for server port  

That matches ROADMAP M2-rest → M3 → M4 without boiling the ocean.
