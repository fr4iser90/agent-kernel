# Vision — agent-kernel control plane

## One sentence

A **local-first project manager for autonomous coding**: register git projects,
initialize them with kernel laws, assign agent profiles/workflows, watch health
(gate/CI/bugs), optionally index code, and **steer DeepSeek Harness** through
policy — without becoming the coding agent itself.

## What it is / is not

| Is | Is not |
|----|--------|
| Control plane + dashboard | Replacement for DSH (executor stays DSH) |
| Policy + profiles + nudge scheduler | Another chat IDE (PIDEA lesson: don’t boil the ocean in UI) |
| Publisher of `lawpack/` into products | Vite/game scaffold |
| Integrator of Gateway / AgentLayer / scanners | Hard dependency on one LLM vendor |

## Core user flows

1. **Register project** — path or git remote; detect stack (deterministic first;
   LLM assist optional).
2. **Initialize** — pin a `lawpack` version into the repo (copy or submodule)
   + write `PROGRESS`/`BUGS`/`ADAPTER` stubs + RUN_ID.
3. **Assign profiles** — e.g. `cycle/lab-followup`, `role/fix-only`,
   `role/docs`, `role/legal-impressum`, `workflow/security-scan`.
4. **Run / nudge** — schedule or trigger DSH sessions with injected policy
   (branch, owned paths, gate command, ACCEPT).
5. **Dashboard** — configurable widgets: green/red gate, open bugs, branch tip,
   last validate, security job, codegraph status.
6. **Optional codegraph** — only above a size threshold; embed via llama.cpp /
   Gateway embeddings; fetch strategy pluggable.

## Design principles

1. **Laws live in the product repo** (lawpack pin) so any harness can read
   files offline. Control plane stores **metadata + pins + schedules**.
2. **Deterministic init by default**; LLM only fills gaps (stack guess, ACCEPT
   hints) and must be reviewable.
3. **Policy before tokens** — requests toward DSH pass a **policy proxy**
   (between LocalAI-GateWay / client and DSH, or as DSH plugin calling this API).
4. **DDD from day one** — domains below; no god-services.
5. **Import checks, not PIDEA wholesale** — LOC/layer/violation ideas from PIDEA
   tests; new UI and bounded contexts here.
6. **Security by default** for remote mode — Traefik + login + least privilege
   to DSH; never expose raw harness without auth.
7. **v1 = single operator** (no login UI); schema already `ownerId`-ready —
   multi-user auth/ACL only at remote harden (ADR-0003).

## Success (v1)

- 3+ of your git projects registered locally  
- One init path plants lawpack + RUN_ID without manual copy  
- One profile runs a Followup-shaped loop via DSH  
- Dashboard shows gate + BUGS Open + branch  
- Protect + architecture violation tests exist in *this* repo’s gate  

## Non-goals (v1)

- Multi-tenant SaaS  
- Replacing GitHub Actions  
- Full IDE mirroring (PIDEA)  
- Mandatory codegraph on every tiny repo  
