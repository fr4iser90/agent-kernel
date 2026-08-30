# Getting started — install through first runs

**Diátaxis:** tutorial. Product terms:
[`../explanation/orchestration.md`](../explanation/orchestration.md). Injection:
[`../explanation/operating-model.md`](../explanation/operating-model.md).
Per-project Init: [`../how-to/init.md`](../how-to/init.md).

Install topologies, Login/setup, and a measurable first day (§8).

**Supported topologies:** local native, local Docker, and remote Docker host
(Traefik). Local Docker uses the same `deploy/` Compose artifacts as remote,
without public ingress —
[`../explanation/runtime-topology.md`](../explanation/runtime-topology.md).

Related: [`../reference/settings.md`](../reference/settings.md),
[`../adr/0004-dual-injection-multi-executor.md`](../adr/0004-dual-injection-multi-executor.md).

**Docs language: English only.**

---

## 1. Mental model

```text
agent-kernel          = project + agent + orchestration control plane
ExecutorPort          = pluggable coding harness adapter
  ├─ dsh              = DeepSeek Harness (v1 adapter)
  ├─ claude-code      = adapter (same Brief contract)
  ├─ pi               = adapter (same Brief contract)
  └─ …
GateWay               = models (operator agent + coding path)
Lawpack               = content pin (laws/roles)
```

**DSH** is the v1 `ExecutorPort` adapter, not the control plane. Remote
deployment of the control plane uses Compose under **`deploy/`**, co-located
with DSH, Traefik, and GateWay.

---

## 2. Install — complete lists

### Topology comparison

| | Local | Remote host |
|--|--------|-------------|
| **Purpose** | Development and operator workstation | Production / always-on control plane |
| **Container runtime** | Optional (L-native or L-docker) | Required |
| **Public ingress** | Loopback only | Traefik (HTTPS) |
| **Authentication** | Not required on loopback | Traefik auth (product login/ACL: M6) |
| **Workspace** | Host filesystem paths | Shared `WORKSPACE_ROOT` volume |

`deploy/` **MUST** provide a **local** Compose profile (image parity) and a
**remote** profile (Traefik labels, auth). Host `pnpm dev` remains available for
rapid iteration; it is not the sole local topology.

---

### Profile L-native — Local without Docker (kernel)

1. agent-kernel git clone  
2. Node.js + pnpm  
3. `pnpm install`  
4. SQLite data path  
5. `pnpm hooks:install` (recommended)  
6. DSH native **or** DSH-only Docker (executor can be containerized even if kernel is not)  
7.–10. GateWay (coding + control-plane), keys, ≥1 product clone  
11.–12. Optional DSH Web UI / nudge CLI bridge  

```bash
pnpm install && pnpm hooks:install && pnpm dev
```

---

### Profile L-docker — Local Compose

Control plane and dependencies on the workstation via containers. Public Traefik
is not required.

1. Docker + Docker Compose  
2. `deploy/` **local** Compose profile (API + Web + DB volume)  
3. Optional on same Compose network: policy-proxy  
4. DSH — local container **or** native talking to published Host port  
5. GateWay reachable (host or container)  
6. Bind-mount product paths **or** a local workspace root into API+DSH  
7. Secrets via `.env` / Compose  
8. Lawpack path/volume for API  
9. Smoke: localhost UI → register path → Init → Brief → one DSH nudge  

L-docker validates image and mount behavior prior to remote deployment.

---

### Profile S — Remote Docker host

Co-located with DSH on the operator’s Docker host. Compose profile: `deploy/`
remote. Ingress: Traefik HTTPS. DSH Host API remains internal-only.

1. Docker + Docker Compose  
2. Traefik (public HTTPS)  
3. Auth in front of Traefik for kernel UI/API  
4. agent-kernel API container  
5. agent-kernel Web  
6. Persistent DB volume  
7. Host `WORKSPACE_ROOT` bind-mounted into kernel **and** DSH  
8. policy-proxy on Docker network  
9. DSH container(s) — internal Host API only  
10. GateWay — internal URL  
11. Secrets (GateWay, git, DSH)  
12. Outbound git to remotes  
13. Lawpack for API  
14. Optional: AgentLayer  
15. Optional: other executor adapters  
16. Smoke: Traefik→UI, provision from `gitRemote`, Init, Brief, one DSH session  

Server Catalog: **`gitRemote` required** for normal provision; path on workspace volume.

---

### First-boot Settings (both profiles — still install/usable checklist)

- `executorId` default (`dsh`)  
- DSH invoke mode / endpoint (CLI vs Host URL)  
- GateWay URL + control-plane key ref  
- Default injection mode / layout / tracking  
- Git policy flags (default **off**)  
- Optional analyzer preferences  
- Server: `workspaceRoot` / volume path alignment with DSH  

### Out of scope for stack install (operator product setup)

Login, setup wizard / Settings, project Init, assignments, nudges, chat — see §3–5.

---

## 3. Console vs Web UI

### A — Console / host (stack install & process lifecycle)

| Step | Where | Action |
|------|--------|--------|
| 1 | Shell | Clone agent-kernel **or** build/pull `deploy/` images |
| 2 | Shell | `pnpm install` **or** `docker compose up` |
| 3 | Shell / Compose env | Secrets: DB, GateWay URL/key refs, DSH endpoint, `WORKSPACE_ROOT` (remote) |
| 4 | Shell | Start API/Web (+ proxy/DSH as topology requires) |
| 5 | Shell | Health check (`/health`, ports, Traefik on remote) |

**Exit criterion:** control-plane HTTP is reachable. Catalog remains empty until setup via UI or API.

### B — Web UI (product setup & operation)

| # | Surface | Action |
|---|---------|--------|
| 1 | **Login** | Authenticate (hard gate) |
| 2 | **Setup wizard** (first boot) or **Settings** | Executors, GateWay, delivery defaults, git policy, prefs, workspace root |
| 3 | **Projects** | Register (local path / remote `gitRemote`) |
| 4 | **Sniff** | Deterministic metadata |
| 5 | **Init** | Preset → preview → apply (optional LLM suggest) |
| 6 | **Agents** | Assignments, global, pause |
| 7 | **Overview / detail** | Status, attention |
| 8 | **Nudge / Runs** | Start/nudge, Brief, history |
| 9 | **Operator chat** | Same tools via natural language |

| Topology | Auth |
|----------|------|
| Remote (S) | Required (Traefik and/or product login). No public unauthenticated UI. |
| Local | Login gate in design; until M6 may auto `local-owner` on loopback only. |

---

## 4. Setup installer (Web UI)

After Login, if required Settings are missing, the app **MUST** open a
**first-boot setup wizard** (blocking). Re-editable later under Settings.

```text
┌─────────────────────────────────────────────────────────┐
│  agent-kernel · Setup                     Step 2 of 5   │
│  ● ● ○ ○ ○                                              │
├─────────────────────────────────────────────────────────┤
│  Default executor                                       │
│  ( ) DeepSeek Harness  ( ) Claude Code  ( ) Pi          │
│  Invoke: [ CLI ▼ ]   Host URL: [………………]                 │
│  GateWay URL: [………………]   API key ref: [••••]            │
│                                                         │
│  [Back]                                [Continue]       │
└─────────────────────────────────────────────────────────┘
```

| Step | Panel | Gate to continue |
|------|--------|------------------|
| 1 | Welcome / topology | Continue |
| 2 | Executors (`executorId`, endpoints) | Valid default executor |
| 3 | GateWay URL + credential ref | Required on remote; local may defer only if documented |
| 4 | Delivery defaults + git policy (default off) | Saved |
| 5 | Workspace root (remote) | Mount/path OK |
| 6 | Preferences (optional) | Skip allowed |
| End | Summary → Finish → Overview or “Register first project” | — |

One primary action per step; advanced options collapsed.

---

## 5. Three completion paths (identical APIs)

| Path | Driver | Mechanism |
|------|--------|-----------|
| **A. Guided installer** | Operator in browser | Login → setup wizard → Projects → Init … |
| **B. API + credential** | Script / automation | Token/session → `PUT /api/settings` → projects → sniff → init/preview → init (OpenAPI) |
| **C. LLM operator agent** | GateWay tools | Same as B; draft fields; **preview required**; Apply per `reviewMode` (default `human`) |

```text
Console: compose / pnpm up
    → Browser Login
    → Path A (wizard) | Path B (API key) | Path C (LLM tools)
    → Projects / Init / Agents / Nudge
```

No separate LLM-only installer. No public host without Login.

---

## 6. Per-project flow (after login + settings)

1. Register → sniff → Init (manual or LLM suggest) → preview → apply  
2. Assignments  
3. Nudge/schedule → Brief → Policy → `ExecutorPort[executorId]`  

---

## 7. Multi-executor

Same Brief; adapter selected by `executorId` (`dsh`, later `claude-code`, `pi`, …).

---

## 8. You have succeeded when…

Complete **one** topology (L-native, L-docker, or S). Check every box:

| # | Criterion | How to verify |
|---|-----------|----------------|
| 1 | Control plane HTTP is up | `pnpm health` or `GET /health` returns OK |
| 2 | Web UI loads | Browser opens the published UI URL |
| 3 | Login gate | You land on `/login` (local may auto-resolve `local-owner`) |
| 4 | Settings saved | Setup wizard finished **or** `GET /api/settings` has `schemaVersion` + `executorId` |
| 5 | Project registered | Catalog shows ≥1 project (path or `gitRemote`) |
| 6 | Init applied | Project has a Lawpack pin; preset is `clean`, `tracking`, or `offline` |
| 7 | Brief dry-run | SessionBrief preview succeeds for that project |
| 8 | One executor nudge | At least one run via `ExecutorPort` (`dsh` in v1) — or documented dry-run if DSH unavailable |

Optional (remote S): Traefik HTTPS + auth in front of UI/API.

Until 1–6 are true, treat install as incomplete. 7–8 close the tutorial loop.

---

## 9. Summary

| Topic | Spec |
|-------|------|
| Console | Stack up only (clone/compose/env/health) |
| Web entry | **Login** → setup wizard / Settings → … |
| Installer UX | Blocking first-boot wizard (§4) |
| Alternate setup | API credential or LLM tools on same endpoints (§5) |
| Topology | L-native, L-docker, remote (S) |
| Executors | `ExecutorPort`; v1 = `dsh` |
| Success | §8 checklist |
