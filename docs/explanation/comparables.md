# Comparables — similar systems on GitHub

These are **real** public projects. agent-kernel is **not** unique as “run coding
agents.” It is specific as **your** control plane: multi-**project** catalog +
Lawpack pin/delivery + Settings/policy + DSH/GateWay/AgentLayer.

Meta-list: [awesome-agent-orchestrators](https://github.com/marktantongco/awesome-agent-orchestrators).

## Closest class: agent managers / orchestrators

| Project | URL | What it is | Overlap | Gap vs agent-kernel |
|---------|-----|------------|---------|---------------------|
| **Agent Orchestrator** | https://github.com/AgentWrapper/agent-orchestrator | Fleet IDE: plan, spawn workers, Kanban, worktrees, CI/PR loop (~10k★) | Multi-agent supervision | Not Lawpack; not DSH/GateWay-native; one-repo fleet focus |
| **Claude Squad** | https://github.com/smtg-ai/claude-squad | TUI: many Claude/Codex/… in tmux + git worktrees | Parallel agents per tasks | Terminal manager, not project portfolio control plane |
| **Vibe Kanban** | https://github.com/BloopAI/vibe-kanban | Kanban = agent sessions / worktrees | Visual task↔agent board | Board-centric; no your law pin model |
| **Crystal → Nimbalyst** | https://github.com/stravu/crystal · https://github.com/nimbalyst/nimbalyst | Desktop: parallel Claude/Codex/OpenCode + worktrees + session kanban | Multi-session UI | Session workspace, not lawpack + multi-project Init |
| **Branchwork** | https://github.com/branchwork/branchwork | Dashboard/MCP: plans, practices, observe or drive Claude | Status + practices inject | Claude-centric plan YAML; not your executor stack |
| **ZComb** | https://github.com/BLERBZ/zcomb | Autonomous Claude Code team + live React dashboard | Dashboard + spawn roles | Objective→swarm for one effort; not long-lived project catalog |
| **agent-kanban** | https://github.com/saltbo/agent-kanban | Agent-first kanban, multi-runtime | Board + runtimes | Different identity/runtime model |
| **OpenHands** | https://github.com/All-Hands-AI/OpenHands | Open coding agent platform | Autonomous coding | Agent runtime itself, not your control plane |
| **Aider** | https://github.com/Aider-AI/aider | Pair-programming CLI agent | Coding in git repos | Single-agent CLI; no multi-project OS |
| **Devin / Cursor Cloud / Codex Cloud** | commercial | Hosted background agents → PRs | Autonomous runs | Closed; not local Lawpack/DSH |

## Related (substrate, not the same product)

| Project | URL | Note |
|---------|-----|------|
| Worktree helpers / env | e.g. community `workz`, Claude `--worktree` | Isolation primitive many orchestrators wrap |
| Gas Town / Antfarm / Ralph-loop stacks | various (Yegge / Carson patterns) | High-scale overnight fleets — different ops model |
| Microsoft Agent Framework / Conductor-style | enterprise SDKs | Workflow YAML; ecosystem lock-in risk |
| **PIDEA** (yours) | private/local | Project mgmt + IDE ambitions — steal checks, not monolith |

## Honest differentiation

| Capability | Typical orchestrator above | agent-kernel target |
|------------|----------------------------|---------------------|
| Parallel agents on **one** repo | Strong | Secondary (can nudge many assignments) |
| **Many projects** as first-class catalog | Weak / absent | Core |
| Plantable / injectable **law pack** + pin | Absent | Core (`lawpack/` + ADR-0004) |
| DeepSeek Harness + LocalAI-GateWay | Absent | Core integration |
| Operator Settings (git policy, delivery mode) | Ad hoc | Documented Settings model |
| Coding UI / worktree IDE | Often the product | **Out of scope** (executor owns coding) |

## Takeaway

Yes — GitHub is full of **agent managers**. Copy patterns (worktrees, Kanban,
session status). Do **not** assume any of them replaces Lawpack + multi-project
Init + your executor/policy stack.
