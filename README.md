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

- Spec + Lawpack + ADRs (incl. single-user v1)  
- **Scaffold running:** `pnpm dev` → API `:8787` + Web `:5173` (project register/list)  
- Next: Lawpack Init from UI  

**Read next:** [docs/VISION.md](docs/VISION.md) → [docs/NAMING.md](docs/NAMING.md) → [docs/TREE.md](docs/TREE.md).

## Dev

```bash
pnpm install
pnpm dev          # API :8787 + Web :5173
pnpm gate         # typecheck + test + build
```
