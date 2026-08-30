# Nudge a run

**Diátaxis:** how-to. Layers D–F:
[`../explanation/orchestration.md`](../explanation/orchestration.md).
Executor wiring: [`../explanation/operating-model.md`](../explanation/operating-model.md).

## Goal

Start or continue one coding session for an assignment via `ExecutorPort`.

## Steps (Web UI)

1. Open **Project** → Assignments (or **Runs**).  
2. Choose assignment → **Nudge now** (or wait for schedule).  
3. Control plane builds **SessionBrief** (pin, roles, gate, paths, profile).  
4. Policy allows start (git/path guards only if Settings enable them).  
5. `ExecutorPort[executorId]` starts/attaches (v1: `dsh`).  
6. UI shows run id / last outcome; coding continues in the executor, not in
   kernel chat.

## Steps (operator chat)

Same tools as the button: “Nudge tracking-cycle on project X” → same nudge API.

## You have succeeded when…

- A run record exists with Brief reference.  
- Executor session started **or** dry-run documented if executor unavailable.  
- Overview / project health reflects last run status.
