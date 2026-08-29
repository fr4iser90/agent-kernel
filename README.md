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
pnpm hooks:install   # once per clone — git pre-commit → fast checks
pnpm dev             # API :8787 + Web :5173
pnpm precommit       # typecheck + test (what the hook runs)
pnpm gate            # full local gate (+ build) before DONE
```

**Gate** = quality checkpoint (see [docs/GATE.md](docs/GATE.md)).  
No GitHub Actions yet — only local pre-commit + manual `pnpm gate`.
