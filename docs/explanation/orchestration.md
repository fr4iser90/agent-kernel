# Orchestration model — projects, agents, layers

**Diátaxis:** explanation. **Canonical** product framing for agent-kernel.
Prefer these terms in product copy and specifications.

Does **not** own: install steps (tutorial), Init field lists (how-to), or
Settings key tables (reference).

**Docs language: English only.**  
Related: [`architecture.md`](architecture.md), [`operating-model.md`](operating-model.md),
[`ui.md`](ui.md), [`../reference/naming.md`](../reference/naming.md).

---

## 1. What the product is

**agent-kernel** is:

1. **Project management** — register and configure *your* git/product projects  
2. **Agent management** — define profiles and bind agents to projects (and optionally globally)  
3. **Orchestration** — decide *when* agents run and start/nudge the **executor** (DSH v1)  

Agents perform **autonomous coding work inside product repositories** for most
of their lifecycle. The control plane does not replace that work; it configures,
authorizes, schedules, and observes it.

| Term | Meaning |
|------|---------|
| **Project** | One managed product workdir (catalog entry) |
| **Agent profile** | Reusable capability binding (role path, defaults) |
| **Assignment** | Concrete agent binding: scope × project × profile × schedule × reviewMode × runId |
| **Run** | One executor session produced by orchestration |
| **Overview** | Cross-project **status** UI (not a separate product concept) |

Do **not** call the product a “portfolio manager”. Overview is a **view** over
projects and assignments.

---

## 2. Orchestration layers (retained model)

Derived from the PIDEA layer discussion, **without** importing PIDEA’s IDE,
task-queue monolith, or step orchestra. Layers are separated by responsibility:

```text
A  Content          Lawpack: laws, roles, prompts (pin + delivery)
B  Binding          Assignment: which agent on which project, RUN_ID, initial objective
C  Schedule         When: infinite | cron | once | on_event | manual
D  Policy           SessionBrief + allow/deny start; optional git/path guards (Settings)
E  Cross-project    Global assignments expanded to N project runs (e.g. security sweep)
F  Execution        ExecutorPort → chosen harness (`executorId`: dsh, later claude-code, pi, …)
```

| Layer | Owned by | Job |
|-------|----------|-----|
| **A Content** | Lawpack pin | What the agent may treat as law/role text |
| **B Binding** | Profiles + Assignments | Who acts on which project |
| **C Schedule** | Orchestration | Cadence of nudges |
| **D Policy** | Policy (+ Settings) | May this start? With which brief? |
| **E Cross-project** | Orchestration | Global agent → fan-out across selected projects |
| **F Execution** | External harness | Autonomous coding in the product workdir |

**v1 emphasis:** A–D + F for project-scoped agents (majority of work).  
**E** is required for “global agents” but still resolves to **per-project**
executor sessions (no agent without a workdir).

### Explicitly not retained from PIDEA

- Framework step engines as the runtime core  
- Task queue as competing source of truth vs PROGRESS/BUGS  
- IDE / file-tree / coding-chat inside the control plane  
- Early multi-tenant admin (auth deferred to remote harden)

---

## 3. Primary operating loop (project-scoped agent)

Majority path — one project, one or more assignments:

```text
1. Project management
   Register project → sniff metadata → Init (delivery mode, pin, tracking options)
2. Agent management
   Create Assignment(s): profile + schedule + reviewMode (+ runId as configured)
3. Orchestration
   Schedule fires or operator requests Nudge
   → build SessionBrief
   → Policy allow
   → ExecutorPort.start/nudge (DSH)
4. Autonomous work (outside kernel UI)
   Agent operates in product workdir under pack laws / injected brief
5. Observation
   Overview + project detail: status, attention, last run (when recorded)
```

Init is **provisioning**, not orchestration. Orchestration begins at schedule/nudge.

---

## 4. Who does what (actors)

Orchestration layers (A–F) are **responsibilities**, not job titles. Actors:

| Actor | Where | Does | Does not |
|-------|--------|------|----------|
| **Operator (human)** | Web UI / operator chat | Same control-plane actions as below when acting manually; remains accountable for Settings and high-risk policy | Mandatory for every click when automation is enabled |
| **Operator agent (human replacement — control plane)** | agent-kernel + GateWay + **API tools** | Can perform Init assistance, assign/pause, nudge, apply Analyzer advice, answer “what’s red?” — subject to `reviewMode` / auto-apply prefs | Code the product repo; bypass Policy |
| **Control plane (API)** | `apps/api` | Catalog, pin, assignments, schedules, Brief, policy allow/deny, run records, advice scores | Replace DSH as coder |
| **Orchestrator (logical role)** | Same API (+ operator agent tools) | Expand schedules / global fan-out, issue nudges, pause/resume | Invent side channels outside our tools |
| **Coding agent (human replacement — product work)** | Executor workdir (DSH …) | Autonomous implementation under Lawpack / Brief (the grunt work a human developer would do) | Manage the project catalog |
| **GateWay** | Your stack | Models for operator agent *and* coding agent (separate key paths) | Own project truth |
| **Analyzer** | Control plane | Facts + preferences → ranked advice that *feeds* the operator agent / UI | Auto-apply by default |

### Two kinds of “human replacement”

| Kind | Replaces | Mechanism |
|------|----------|-----------|
| **Control-plane** | You clicking around (assign, nudge, triage) | Operator chat / scheduled operator tools + `reviewMode` (`human` \| `llm_propose` \| `llm_auto`) and optional auto-apply prefs ([`analyzer.md`](../reference/analyzer.md), [`ui.md`](ui.md)) |
| **Product** | You coding in the repo | Coding agent Assignment on that project (majority of runtime) |

Default: operator agent **proposes**; product coding agents **run** on schedule once assigned.  
`llm_auto` / auto-apply prefs are explicit opt-in — not implied by Init.

**“Orchestrator agent”** = operator agent scoped to orchestration tools (nudge, pause,
global fan-out), still backed by the same API — not a third coding harness.

---

## 5. Human replacement vs review

| Concept | Meaning |
|---------|---------|
| **Operator agent** | LLM + tools that can do what you do in the control plane (triage, assign, nudge) |
| **Coding agent** | LLM + executor that does what you do in the product repo |
| **Analyzer advice** | Ranked suggestions that feed the operator agent / UI |
| **`reviewMode`** | Gate on accepting outcomes / applying proposals: `human` \| `llm_propose` \| `llm_auto` |
| Default | Advice suggest-only; operator actions confirmed by human unless opt-in automation |

Human replacement **narrows** manual work; it does not remove Policy or Settings as
the source of constraints.

---

## 6. Chat (two channels)

| Channel | Product | Peer | Purpose |
|---------|---------|------|---------|
| **Operator chat** | agent-kernel | Control plane / orchestrator tools | Status, advice, assign, nudge, “what’s red?” |
| **Coding chat** | DSH (or other executor UI) | Coding agent | Edit code, gate, commits |

Scopes for operator chat: **overview** · **single project** · **orchestrator**
(schedules / global pause / fan-out). Optional deep-link: start/attach DSH only —
no IDE transcript inside kernel.

---

## 7. Global agents (layer E)

A **global** assignment does not invent a second execution plane. Orchestration
**expands** it into project-scoped runs. Selection rules (tags / allow-list /
all initialized): **[`../reference/orchestration-api.md`](../reference/orchestration-api.md)**.

```text
Global Assignment (e.g. security, weekly)
  → Orchestrator selects target projects
  → For each target: Brief + Policy + Executor (same as project agent)
```

---

## 8. UI mapping (names)

| UI | Responsibility |
|----|----------------|
| **Overview** | Cross-project attention and health (view only) |
| **Projects** | Project management: list, register, detail, Init |
| **Agents** | Agent management: profile library, assignments (project + global) |
| **Runs** (M4) | Orchestration history: session ids, outcomes |
| **Settings** | Operator defaults (delivery, git policy, executors) |

Operator chat scopes: **overview**, **single project**, **orchestrator**
(schedules / pause / nudge).

---

## 9. Alignment checklist

- [x] Docs distinguish project / agent / orchestration (avoid “portfolio” as domain noun)  
- [x] Actors table: operator, control plane, orchestrator role, coding agent, advice  
- [x] Orchestrator = API + chat tools, not a parallel coding agent  
- [x] Human replacement = Analyzer advice + `reviewMode`; default suggest-only  
- [x] Operator chat vs coding chat documented  
- [x] Global fan-out selection rules (tags / allow-list) — [`../reference/orchestration-api.md`](../reference/orchestration-api.md)  
- [ ] Schedules live on Assignments; execution is Orchestration → ExecutorPort (**implement M4** — contract in orchestration-api.md)  
