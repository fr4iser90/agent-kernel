# Runtime topology — local first, Docker server later

How **agent-kernel** talks to **DeepSeek Harness (DSH)**, and how that changes
when you move from a laptop to a Docker/Traefik server.

**Operator path (this repo):** almost everything **local first**; later the same
control-plane ideas run **beside DSH in Docker** on the server. The product UI
(dashboard) is web; the **DSH control path does not require the DSH Web UI** —
CLI or Host HTTP/API is enough.

Related: [`integrations.md`](integrations.md), [`architecture.md`](architecture.md),
[`adr/0003-single-user-v1.md`](../adr/0003-single-user-v1.md).

---

## What talks to what

```text
You
 ├─ agent-kernel Web (dashboard)     manage projects / init / profiles
 └─ (optional) DSH Web UI            watch a session — not required for nudge

agent-kernel API
 └─ Orchestration + in-process start policy
      └─ ExecutorPort → DSH Host (CLI or HTTP)   cwd = product workdir + SessionBrief
           └─ GateWay → models
```

| Contract | Owner | Notes |
|----------|--------|--------|
| **SessionBrief** | `@agent-kernel/session-brief` | RUN_ID, role path, gate, schedule, paths |
| **Lawpack on disk** | product repo `vendor/lawpack/` | DSH reads laws offline from cwd |
| **Start / nudge / attach** | Orchestration → DSH | CLI first; Host API when DSH already running |

Dashboard **configures**. DSH **executes**. Start policy runs **inside the API**
so “start run” is authorized and workdir/brief match the Project — **no** sidecar.

---

## Phase A — Local

Everything on one machine. Catalog `localPath` is a real filesystem path
(or a bind-mounted workspace root).

**Two supported ways to run the control plane locally:**

| Mode | Kernel | Typical DSH | When |
|------|--------|-------------|------|
| **L-native** | `pnpm dev` on host | Native or Docker | Fast code/UI iteration |
| **L-docker** | `deploy/` Compose on laptop | Same Compose network or Host port | Parity with server images before porting |

```text
Laptop (either mode)
 ├─ agent-kernel     native OR containers from deploy/
 ├─ product clones   host paths (bind-mount into containers if L-docker)
 └─ DSH              native and/or Docker
```

**Implications**

- Register by absolute path (or path inside the shared mount).  
- Nudge: CLI/Host API on loopback or Docker DNS — **no Traefik required** locally.  
- Local Docker is **recommended for parity**, not an afterthought.  
- Git remote optional locally if the folder already exists.

**Local communication**

- Web → API: Vite proxy / localhost.
- API → DSH: subprocess CLI or `http://127.0.0.1:<dsh-port>` on loopback.
- No Docker network required.

---

## Phase B — Server (Docker everything)

Compose and Dockerfiles for **this** product live under **`deploy/`**
([`naming.md`](../reference/naming.md)) — not ad-hoc at repo root. DSH keeps its own
`deploy/` in the harness repo; agent-kernel compose joins the same Docker
network (e.g. Traefik `proxy`) and shares a host workspace volume root.

On the server, prefer **one Docker Compose (or stack) network**: agent-kernel
API + web, DSH, and (already) Traefik / GateWay. Auth at Traefik — never
expose raw DSH. Start policy stays **in-process** in the API (no extra container).

```text
Server (Docker)
 ├─ Traefik (+ auth)             public HTTPS
 ├─ agent-kernel API + web       internal + optional UI route
 ├─ DSH container(s)             /workspace ← host volume
 └─ GateWay / AgentLayer         as today
```

**How containers communicate**

| From → To | How |
|-----------|-----|
| Browser → kernel UI/API | Traefik HTTPS |
| kernel API → DSH | Connect mode (`public_url` / `ssh_reverse` / `vpn` / `same_host`) — Host API |
| DSH → GateWay | internal URL or Traefik |
| kernel/DSH → **git remotes** | HTTPS/SSH out (credentials via env/secrets) |

Do **not** point the server control plane at your laptop paths. Projects on
the server live under a **workspace root** on the host, bind-mounted into
containers (same pattern as DSH deploy: `workspaces/<id>/workspace` →
`/workspace`).

---

## Where do project files live on the server?

**Yes — practically git-dependent** for the server story.

| Approach | When | How |
|----------|------|-----|
| **A. Git clone into workspace (preferred)** | Normal products with a remote | Control plane (or provision job) `git clone` / `fetch` into host volume; Catalog stores path **inside** that volume + `gitRemote` |
| **B. Bind existing host checkout** | Rare admin case | Mount a host dir you already maintain |
| **C. Workspace ZIP upload** | Bootstrap / no remote yet | DSH workspace-transfer; still prefer graduating to git |

Init / Lawpack plant on the server runs **against the clone on the volume**,
same as local — only the path root changes (`/var/lib/ak/workspaces/…` or
DSH’s `workspaces/<user>/workspace/...`).

**Catalog fields that matter across phases**

- `localPath` — always “path visible to the executor”. Local: host path.
  Server: path on the shared volume (same path string inside API + DSH
  containers if both mount the same root).
- `gitRemote` — required for **server provision** (clone/update); optional
  locally if the folder already exists.
- Later: `workspaceRoot` / executor id if multiple DSH users/containers.

Agent loops still **push/pull the same `agent/<RUN_ID>` branch** (lawpack
rules). Without a remote on the server you can work only inside the volume
until you add one — fine for experiments, bad for backup and multi-host.

---

## Native vs Docker (DSH itself)

| | Native | Docker |
|--|--------|--------|
| **Local** | Simplest; cwd = Catalog path | Optional parity with server image |
| **Server** | Possible but awkward with Traefik | **Default** — your stack already does this |
| Tools | Host toolchain | Image (Node, git, Playwright, …) |
| Isolation | Weak | Stronger |

agent-kernel does not embed DSH. It only needs a **stable way to start/nudge
a session with a workdir + brief** — native binary or container Host API.

---

## Web vs CLI (again)

| Surface | Needed for v1? | Role |
|---------|----------------|------|
| agent-kernel **Web** | Yes (product UX) | Register, Init wizard, profiles, status |
| DSH **Web UI** | No | Human watching / debugging |
| DSH **CLI / Host API** | Yes (executor) | What Orchestration calls |
| Thin `scripts/nudge-*.sh` | Useful bridge | Local MVP before full proxy |

---

## Porting checklist (local → server)

1. Keep SessionBrief + Assignments unchanged — only executor endpoint changes.
2. Introduce a **workspace root** env (e.g. `WORKSPACE_ROOT`) shared by
   API and DSH volumes.
3. Register/provision: if path missing and `gitRemote` set → clone into
   `$WORKSPACE_ROOT/<projectId-or-slug>`.
4. Put API→DSH on the **internal** Docker network; public URL only via Traefik
   + auth (ADR-0003 → M6 login).
5. Secrets (git, GateWay, DSH) via env/compose secrets — never in Lawpack.
6. Smoke: one project clone + Init + SessionBrief dry-run + one manual DSH
   session with that workdir before enabling cron nudge.

---

## Non-goals

- Replacing git with a proprietary file sync as the main server model.
- Requiring the DSH browser UI for autonomous runs.
- Kernel and DSH on different machines **without** shared volume or git
  (that forces upload/sync hacks — avoid in v1).

---

## Summary

- **Now:** local paths + local DSH (native or Docker); git optional if clone
  already exists.
- **Later:** all Docker; containers talk on an internal network; **projects
  are clones on a shared volume**, so server mode is **git-first**.
- Same Brief / Lawpack / RUN_ID story in both phases — only path roots and
  how you invoke DSH change.
