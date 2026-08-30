# Operating model — injection and Settings

**Diátaxis:** explanation. **Canonical terms / layers A–F:**
[`orchestration.md`](orchestration.md). **Install tutorial:**
[`../tutorials/getting-started.md`](../tutorials/getting-started.md).
**Init wizard/API:** [`../how-to/init.md`](../how-to/init.md).

Covers both injection modes, Overview vs Project vs Settings, and agent
binding. Does **not** repeat install checklists or Init field catalogs.

**Product decision ([ADR-0004](../adr/0004-dual-injection-multi-executor.md)):**  
ship **repo_plant** *and* **harness_inject**. Default: harness inject (B-first);
repo plant stays a full option. Executors pluggable (DSH first; Claude / Pi later).

Related: [`ui.md`](ui.md), [`runtime-topology.md`](runtime-topology.md),
[`../adr/0001-control-plane-vs-lawpack.md`](../adr/0001-control-plane-vs-lawpack.md),
[`../reference/settings.md`](../reference/settings.md).

---

## 1. Execution — DSH now, other harnesses later

| Layer | Runs where | Job |
|-------|------------|-----|
| **agent-kernel** | Web + API (+ later Docker) | Catalog, Init, profiles, schedules, health, operator chat, nudge |
| **Executor** | DSH (v1); later Claude Code, Pi, … | Coding loop in the product workdir |
| **GateWay** | Your stack | Models for coding (via executor) and operator chat (via kernel) |

Kernel never replaces the coding agent. Orchestration talks to an
**`ExecutorPort`**: `start/nudge/attach(SessionBrief)` — first adapter = DSH.

---

## 2. Both injection ways (first-class)

```text
                    ┌─ repo_plant ──────────────► files in product git/workdir
 SessionBrief ──────┤
                    └─ harness_inject ──────────► Brief + ephemeral laws → Executor
                         (DSH / Claude / Pi / …)
```

| Mode | What it does | When to pick |
|------|----------------|--------------|
| **`repo_plant`** | Init writes Lawpack and/or stubs into the repo (`vendor/lawpack/`, AGENTS, …) | Offline CI protect, share laws without kernel, classic lab attach |
| **`harness_inject`** | Pin in DB; at run, policy injects Brief (+ optional gitignored/mount lawpack or prompt) into the harness | Cleaner product git; one pin in control plane; multi-harness |

**Always:** control plane authorizes start/nudge (thin policy), even if laws
already sit in the repo.

**Almost always:** PROGRESS / BUGS / ADAPTER as product tracking (not “kernel
vendor spam”).

| Sub-option under `repo_plant` | Committed |
|-------------------------------|-----------|
| A-full | `vendor/lawpack/` + stubs |
| A-thin | stubs only; laws still via inject or submodule later |

| Sub-option under `harness_inject` | Laws at run time | What may still touch the product tree |
|-----------------------------------|------------------|----------------------------------------|
| **Strict** | Prompt and/or ephemeral mount only; pin only in Kernel DB | **Nothing** required in git for laws |
| **Hybrid** | Same, plus optional gitignored `.agent/lawpack/` | PROGRESS/BUGS/ADAPTER as normal files (agent `write`) |
| Prompt-pack only | Inline role text in Brief | Weakest for long `read` of role files |

### harness_inject — how it works (walkthrough)

**What you thought (correct for laws):** Pin + Lawpack content live in
**agent-kernel** (DB / pack store). Product git does **not** need
`vendor/lawpack/`.

**What confused tree.md:** We also talked about PROGRESS/BUGS. Those are
*not* Lawpack — they are the agent’s scratchpad. Two designs:

```text
STRICT
  Kernel DB:  project, pin, assignment, PROGRESS/BUGS records (optional)
  Product git: only your code
  On nudge:
    1. Build SessionBrief from DB
    2. Policy allows start
    3. Materialize laws into /tmp or gitignored dir OR paste into first prompt
    4. Start DSH/Claude/Pi with workdir = product
    5. Agent never needs committed vendor/
    6. If tracking is DB-backed: agent updates via MCP/API tools from kernel
       (or you accept prompt-only status — weaker)

HYBRID (tracking-friendly)
  Kernel DB:  project, pin, assignment
  Product git: PROGRESS.md / BUGS.md / maybe ADAPTER.md  ← agent file tools
  On nudge:
    1–4 same as strict for *laws*
    5. Agent reads/writes PROGRESS/BUGS on disk like today
    6. .agent/lawpack/ may appear during run but is gitignored — not “in git”
```

So: **harness_inject ≠ “Kernel writes forever into git”**.  
It means **laws are not the repo’s source of truth**. Hybrid only keeps
**run-owned markdown** in the product because that’s how your Followup loop
already works (`read PROGRESS.md`). Strict moves even that into the Kernel
(more work: tools/API).

**Ephemeral `.agent/lawpack/`** = on disk for the agent to `read`, but
**.gitignore** so it never becomes a commit — still harness_inject, not
repo_plant.

**repo_plant** = you *want* `vendor/lawpack/` (and usually AGENTS) **committed**
so CI/offline/other clones see laws without Kernel.

### Multi-harness

Same Brief fields (RUN_ID, role path or inline role text, gate, owned paths,
workdir). Adapter maps:

- **DSH** — CLI/Host API, cwd, Followup text / files  
- **Claude Code / Pi / …** — whatever that tool’s project+prompt entrypoint is  

Adding a harness = new adapter, not a new law dialect.

### Layout paths — configurable, with harness-aware defaults

Yes: the user (Settings global default + per-project override) should set
**where** files land. tree.md trees are **presets**, not the only layout.

| Path role | Default | Configurable? | Notes |
|-----------|---------|---------------|--------|
| Lawpack dir | `vendor/lawpack/` (`repo_plant`) or `.agent/lawpack/` (`harness_inject`, gitignored) | yes | Presets: `vendor/lawpack`, `.agent/lawpack`, custom relative |
| `AGENTS.md` | **repo root** | caution | **DSH** auto-loads `AGENTS.md` / `CLAUDE.md` from the **workspace root** (session cwd), with a byte budget — not from arbitrary nested paths unless the agent is told to `read` them |
| `CLAUDE.md` | often symlink/copy of AGENTS at root | yes | Claude Code / some tools expect root `CLAUDE.md` |
| `PROGRESS.md` / `BUGS.md` / `ADAPTER.md` | repo root | yes | Keep root unless you also update Brief + ADAPTER pointers |
| `INITIAL.md` | repo root | yes | Referenced by Followup thin pointer |

**Recommendation**

1. Keep **`AGENTS.md` (and/or `CLAUDE.md`) at workdir root** whenever you want
   automatic harness instruction load (DSH does this today).  
2. Make **lawpack directory** the main knob (`vendor/…` vs `.agent/…` vs custom).  
3. Under `harness_inject`, you can skip root AGENTS and put the whole law
   pointer into the **SessionBrief / first prompt** — then root AGENTS is
   optional; the adapter must inject that text every nudge.  
4. Store chosen paths on Project meta + in ADAPTER (`progress:`, `bugs:`,
   `owned_paths:`) so agents and protect scripts agree.

UI: Init wizard step “Layout” = preset (Standard / Hidden `.agent` / Custom)
plus advanced path fields. Settings = default preset for new projects.

### What the policy / inject path does

1. Allow start only with a valid Assignment + Brief.  
2. Workdir = catalog path.  
3. Inject Followup/Initial (file or prompt).  
4. If `harness_inject`: materialize lawpack for this session (mount/rsync/HTTP).  
5. Optional later: HTTP proxy executor→GateWay for extra denials.

Init wizard: **choose mode** (`harness_inject` | `repo_plant`) + profile/schedule.

---

## 3. Initialization — how it should run

Full wizard, globals vs overrides, Lawpack knobs, and LLM Init API:
**[`init.md`](../how-to/init.md)**.

### Steps (short)

1. Register → sniff → Essentials (mode/preset/profile) → optional Advanced →
   **preview** → **apply**.  
2. LLM path = same `InitRequest` / `init/preview` / `init` (see init.md).  
3. Omitted fields inherit: project override → global defaults → sniff →
   hardcoded.

Re-init = explicit; do not silently overwrite PROGRESS/BUGS.

---

## 4. Overview vs Project vs Settings

### Overview (cross-project status view)

- Attention: uninitialized projects, gate failures, failed policy checks (when enabled), stalled infinite agents, due cron  
- Aggregate health widgets  
- Short list of projects needing action  
- Optional operator chat scoped to **all projects** / orchestrator  
- Not: deep ADAPTER editing for one repo  

### Project (detail)

- Identity + path/remote + Lawpack pin  
- Health for **this** tree  
- Assignments CRUD (add/edit/pause/delete agent)  
- Init / re-sniff / optional protect status  
- INITIAL / Brief preview; **Nudge now**  
- Project-scoped operator chat  

### Settings (global)

Full schema: **[`settings.md`](../reference/settings.md)** (git policy, delivery defaults,
anti-hardcode). Summary:

| Setting | Why |
|---------|-----|
| Workspace root / DSH / GateWay | Runtime topology |
| Default injection mode | Prefer `harness_inject` |
| Default layout + tracking flags | Where files may land |
| **Git policy toggles (default off)** | baseline, RUN_ID pattern, protect — operator-owned |
| Default profile / schedule / preset | Init convenience |
| Widget layout | Overview |
| (M6) Login / ACL | Remote harden |

Per-project gate/stack stay on the **project**. Snapshot of globals at Init
apply — see settings.md layers.

---

## 5. How agents work — Markdown + control-plane records

### Split of responsibilities

| Piece | Form | Editable where |
|-------|------|----------------|
| **Laws / roles** | MD in `vendor/lawpack/roles/*.md` | Lawpack upstream → re-pin; advanced: open files in repo |
| **Product stubs** | `AGENTS.md`, `ADAPTER.md`, `PROGRESS.md`, `BUGS.md`, `INITIAL.md` | Repo (agent writes PROGRESS/BUGS; human fills INITIAL/ADAPTER) |
| **Profile** | Control-plane library row → points at role + prompt templates | Kernel UI: library CRUD (later) |
| **Assignment** | DB: project/global × profile × schedule × reviewMode × runId | Kernel UI: **add / edit / pause / delete** |
| **SessionBrief** | JSON built at nudge time | Dry-run in UI; not hand-edited as source of truth |

So: **behavior text = Lawpack MD** (in repo *or* ephemeral at inject).  
**Who runs when = Assignments in kernel.**  
**This start = Brief → ExecutorPort** (DSH / later others).

### Agent CRUD in the UI (yes)

On **Agents** + **Project → Agents**:

- Add assignment (profile, schedule, cron, reviewMode, optional runId)  
- Edit schedule / pause / resume  
- Delete assignment  
- Dry-run Brief  
- Nudge / stop (M4)  

Editing **role markdown** in-app is optional later (file editor or “open in
editor”); v1 can link to paths. Custom profiles = new library entries that
still **reference** lawpack role files (don’t fork role text into SQLite).

### Global agents

Same Assignment model with `scope=global` (e.g. weekly security). Execution
still goes through DSH or AgentLayer **per target project** (orchestrator
expands to N project briefs), not a magical agent without a workdir.

---

## 6. End-to-end once

```text
User Init wizard (pick harness_inject | repo_plant)
  → stubs (+ vendor/ if repo_plant) + Assignment + lawpack pin in DB
User or cron “Nudge”
  → kernel builds SessionBrief
  → API start-policy allow + workdir
  → if harness_inject: ephemeral laws / prompt into executor
  → ExecutorPort (DSH v1; later Claude/Pi) start/resume
  → agent uses roles + PROGRESS/BUGS; commits on RUN_ID
  → kernel records run outcome
```

---

## 7. Non-goals (reminder)

- Kernel coding chat that replaces DSH  
- Laws only in the proxy with empty product repos  
- Second task database that fights PROGRESS/BUGS  

---

## Summary

- **Both modes ship:** `harness_inject` (into DSH / later Claude, Pi, …) and
  `repo_plant` (files in product git). UI default = harness inject.  
- **Init:** sniff → pick mode → stubs (+ vendor if repo_plant) → Assignment.  
- **Agents:** Lawpack MD + Assignment CRUD; run via **ExecutorPort** (DSH v1).  
- **Policy** always gates start/nudge; laws come from repo *or* inject.
