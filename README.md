# agent-kernel

**Project + agent control plane** for agentic coding — plus the plantable **Lawpack**.

| Piece | Path | Job |
|-------|------|-----|
| **Lawpack** | [`lawpack/`](lawpack/) | Content pack (`MANIFEST.json`, LAWS, roles, optional scripts) — plant **or** inject |
| **Control plane** | `apps/` + `docs/` | Catalog, Init, profiles, Settings, nudge |
| **Deploy** | [`deploy/`](deploy/) | Compose for L-docker / remote Traefik |

Showcase loop: [autonomous-lab](https://github.com/fr4iser90/autonomous-lab).  
Executor: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).  
MCP (VS Code / DSH): [agent-kernel-mcp](https://github.com/fr4iser90/agent-kernel-mcp).

## Status

- Spec + Lawpack MVP + ADRs + **Diátaxis** docs  
- Docs hub: [`docs/index.md`](docs/index.md) · VitePress: `pnpm dev:docs`  
- Scaffold API/web — policy still gated by [`doc-freeze`](docs/explanation/doc-freeze.md)

**Read next:** [docs/index.md](docs/index.md) → [getting-started](docs/tutorials/getting-started.md) → [orchestration](docs/explanation/orchestration.md).

## Dev

```bash
pnpm install          # Node ≥22 (engines)
pnpm hooks:install    # once per clone
pnpm dev              # API :8787 + Web :5173
pnpm dev:docs         # VitePress
pnpm docs:links       # relative markdown link check
pnpm gate             # full local gate (+ build)
```

**L-docker:** see [`deploy/README.md`](deploy/README.md).
