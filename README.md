# agent-kernel

**Project control plane** for agentic coding — plus the plantable **law pack**.

| Piece | Path | Job |
|-------|------|-----|
| **Lawpack** (law pack) | [`lawpack/`](lawpack/) | LAWS, roles, protect scripts, adapters — planted into product repos |
| **Control plane** (this product) | `apps/` + `docs/` | See projects, git, init, agent profiles, dashboards, policy, nudge |

Showcase loop that proved the laws: [autonomous-lab](https://github.com/fr4iser90/autonomous-lab).  
Coding executor: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (e.g. `https://fr4iser-deepseek.fr4iser.com/` behind Traefik).  
Model front door: your [LocalAI-GateWay](https://github.com/fr4iser90/LocalAI-GateWay).  
Optional tools: [AgentLayer](https://github.com/fr4iser90/AgentLayer). Prior UI experiments: [PIDEA](https://github.com/fr4iser90/PIDEA) (lessons, not a rewrite).

## Status

- Spec v0: lawpack laws + scripts  
- Product skeleton: docs + DDD tree (implementation next)  
- Not yet: web UI, git sync, DSH policy proxy, codegraph  

**Read next:** [docs/VISION.md](docs/VISION.md) → [docs/NAMING.md](docs/NAMING.md) → [docs/TREE.md](docs/TREE.md) → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Dev posture

Local-first control plane. Later optional deploy next to DSH (same Traefik/auth story).  
Do not couple product code to Cursor; assume **VS Code + DSH**.
