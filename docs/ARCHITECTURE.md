# Architecture

## Context map

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Dashboard  │────►│  agent-kernel    │────►│ Product repos   │
│  (Web UI)   │     │  control plane   │     │ + lawpack   │
└─────────────┘     └────────┬─────────┘     └────────┬────────┘
                             │                        │
                    policy / nudge / status            │ reads LAWS
                             │                        │
                             ▼                        ▼
                    ┌──────────────────┐     ┌─────────────────┐
                    │ Policy Proxy     │────►│ DeepSeek Harness│
                    │ (gate → DSH)     │     │ (executor)      │
                    └────────┬─────────┘     └─────────────────┘
                             │
              chat/embed keys│
                             ▼
                    ┌──────────────────┐     ┌─────────────────┐
                    │ LocalAI-GateWay  │────►│ llama.cpp/etc.  │
                    └──────────────────┘     └─────────────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ AgentLayer tools │  (security scans, skills, …)
                    │ SimpleSecCheck…  │
                    └──────────────────┘
```

### Lawpack: copy or fetch?

**Both, with a pin:**

| Mode | When | How |
|------|------|-----|
| **Vendor copy** | Default init | Control plane writes `vendor/agent-kernel@<sha>` or `lawpack/` files into product from a released pack |
| **Submodule / subtree** | You want upstream pulls | `git submodule` → this repo’s `lawpack/` |
| **Live fetch** | Rare; air-gapped avoid | Agent/control plane HTTP-fetches pack at session start — **not** sole source of truth |

**Rule:** Product repo must contain a **pinned** law pack so DSH works offline and
CI protect scripts work. Control plane DB stores `lawpack_version` + hash.

DSH does **not** “own” the laws; it **reads** them from the product workdir
(and receives a session brief from the policy proxy).

### Where does policy sit?

**Recommended:** a thin **Policy Proxy** in front of DSH (or DSH client plugin):

1. UI / nudge / VS Code → control plane: “start Followup on project X”  
2. Control plane builds **SessionBrief** (RUN_ID, roles path, gate, owned paths,
   profile, budget)  
3. Proxy ensures DSH working directory = project path; injects brief + forbids
   tools that violate policy (e.g. push main)  
4. Model traffic for the *product coding agent* may still go
   DSH → GateWay → models; control plane uses GateWay for *its own* LLM init
   assists / embeddings  

Do **not** fork DeepSeek Harness into this monorepo. Integrate.

## DDD bounded contexts

| Context | Responsibility |
|---------|----------------|
| **Catalog** | Projects, git remotes, local paths, stack detection |
| **Provisioning** | Init, lawpack pin, RUN_ID, ADAPTER stub |
| **Profiles** | Agent/role/workflow definitions (cycle, fix-only, docs, legal, security) |
| **Policy** | Branch rules, owned paths, tool allow/deny, SessionBrief |
| **Orchestration** | Nudge schedules, run history, link to DSH session ids |
| **Observability** | Gate/CI status, BUGS summary, widget layout preferences |
| **Knowledge** | Optional codegraph / embeddings (threshold + fetch strategy) |
| **Identity** | Local users; later SSO for remote Traefik deployment |

Shared kernel: IDs, time, Result types — no business rules.

## Layering (per backend app)

Classic DDD / ports & adapters (align with PIDEA/AgentLayer habits, keep thin):

```
presentation/     # HTTP, WS (dashboard API); optional maintainer scripts later — UX is web
application/      # use cases / handlers
domain/           # entities, VOs, domain services, ports (interfaces)
infrastructure/   # git, fs, sqlite/pg, DSH client, Gateway client, AgentLayer
```

**Dependency rule:** `presentation → application → domain ← infrastructure`.  
Tests fail on layer violations (import linter / arch unit tests).

## Frontend

- Separate `apps/web` (SPA) talking to `apps/api`  
- Configurable dashboard: user widget layout persisted in Observability/
  Identity preferences  
- No IDE mirror in v1  

## Data

- v1: SQLite (local-first)  
- Later: Postgres if server-deployed  
- Secrets: never in git; OS keyring / env / GateWay keys  

## Testing strategy

| Layer | Examples |
|-------|----------|
| Domain | RUN_ID validation, profile composition, policy deny |
| Application | Init use case (temp dir fixture), SessionBrief builder |
| Arch gate | No domain→infrastructure imports; file LOC caps (PIDEA-like) |
| Contract | DSH/Gateway client fakes |
| E2E (later) | Register → init → brief dry-run |

## Security (remote later)

- Traefik + auth in front of control plane **and** DSH  
- Login (reuse GateWay users or dedicated OIDC later)  
- Project ACL: which user can nudge which repo  
- Audit log of SessionBrief + who triggered  

## Comparables (learn, don’t clone)

See [`COMPARABLES.md`](COMPARABLES.md). Closest ideas: Agent Orchestrator,
Entourage, AWF, SwarmGit, Daintree — none replace *your* lawpack laws +
GateWay + DSH home lab.
