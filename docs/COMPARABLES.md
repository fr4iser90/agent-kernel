# Comparables — similar systems

None of these are a drop-in for **your** stack (lawpack laws + DSH +
LocalAI-GateWay + AgentLayer). Use them as inspiration.

| Project | Strength | Gap vs agent-kernel |
|---------|----------|---------------------|
| [Agent Orchestrator](https://github.com/AgentWrapper/agent-orchestrator) | Fleet of coding agents, Kanban, worktrees | Not your law pack; not GateWay/DSH-native |
| [Entourage](https://github.com/deepampatel/entourage) | MCP agents, dashboard, event-sourced tasks | Different executor model |
| [AWF](https://github.com/dimileeh/agent-workspace-fabric) | Worktree + Docker + PR monitor loop | Execution substrate, not project portfolio UI |
| [SwarmGit](https://github.com/rjben/swarm-git) | Parallel worktrees, merge coordinator | CLI orchestrator only |
| Daintree / Vibe Kanban / Crystal | Multi-agent panels, broadcasting | General agent hosts; weak “plant laws into repo” |
| Microsoft Conductor | YAML workflows, Copilot SDK | Ecosystem lock-in risk |
| **PIDEA** (yours) | Project mgmt + IDE ambitions, analysis steps | UI/complexity debt — **steal checks, not the monolith** |

## Takeaway

Build **control plane + lawpack + policy proxy**. Reuse patterns
(worktrees, Kanban, MCP tools) without adopting a foreign product as core.
