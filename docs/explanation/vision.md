# Vision — agent-kernel control plane

## One sentence

A **local-first project + agent manager for autonomous coding**: register git
projects, initialize them with a pinned Lawpack (plant **or** harness inject),
assign profiles/workflows, watch health, and **steer coding executors**
(DeepSeek Harness v1; Claude Code / Pi later) through policy — without becoming
the coding agent itself.

## What it is / is not

| Is | Is not |
|----|--------|
| Control plane + dashboard | Replacement for DSH / other executors |
| Policy + profiles + nudge scheduler | Another chat IDE (PIDEA lesson) |
| Publisher / injector of `lawpack/` into products | Vite/game scaffold |
| Integrator of GateWay / AgentLayer / scanners | Hard dependency on one LLM vendor |

## Core user flows

1. **Install + Login** — bring the stack up ([`../tutorials/getting-started.md`](../tutorials/getting-started.md));
   operator journey starts at **Login**, then a blocking **setup wizard** /
   Settings ([ADR-0003](../adr/0003-single-user-v1.md)).
2. **Register project** — path or git remote; sniff stack (deterministic first;
   LLM assist optional).
3. **Initialize** — pin Lawpack; delivery default **`harness_inject`** (B-first);
   `repo_plant` remains a full option ([ADR-0004](../adr/0004-dual-injection-multi-executor.md)).
   Tracking files / RUN_ID per Settings presets (`clean` / `tracking` / `offline`).
4. **Assign profiles** — e.g. `tracking-cycle`, `fix-only`, `docs`, security
   workflows (names are control-plane profiles, not Lawpack package ids).
5. **Run / nudge** — schedule or trigger sessions via `ExecutorPort` + SessionBrief
   (branch/owned-path guards only when Settings enable them).
6. **Dashboard** — Overview + project detail; gate, bugs, branch, last run.
7. **Operator chat** — control-plane tools via GateWay; coding chat stays in the
   executor ([`ui.md`](ui.md)).
8. **Optional codegraph** — above a size threshold; embeddings via GateWay.

## Design principles

1. **B-first delivery** — default laws arrive via `harness_inject` (pin in the
   control plane). `repo_plant` pins laws into product git when offline/CI needs
   them. Tracking markdown is a separate Settings choice (`tracking` preset).
2. **Settings own policy knobs** — git assert/protect/hooks default **off**;
   pack prose is not automatic enforcement ([`../reference/settings.md`](../reference/settings.md)).
3. **Deterministic Init by default**; LLM fills gaps and stays reviewable.
4. **Policy before tokens** — starts pass in-process start policy / SessionBrief gate.
5. **DDD from day one** — bounded contexts; no god-services.
6. **Import checks, not PIDEA wholesale**.
7. **Login-first UX** — every operator journey starts at `/login`. Local v1 may
   resolve to implicit `local-owner` without credentials; remote never exposes an
   unauthenticated public UI ([ADR-0003](../adr/0003-single-user-v1.md)).
8. **Schema multi-user-ready** — `ownerId` from day one; full ACL at M6.

## Success (v1)

- Stack reachable; Login → setup wizard saved Settings  
- ≥1 project registered; Init applied with a documented preset  
- One profile nudged through `ExecutorPort` (`dsh`)  
- Overview shows gate/health signals for that project  
- This repo’s `pnpm gate` green  

## Non-goals (v1)

- Multi-tenant SaaS  
- Replacing GitHub Actions  
- Full IDE mirroring (PIDEA)  
- Mandatory codegraph on every tiny repo  
