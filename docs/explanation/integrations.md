# Integrations

## DeepSeek Harness (executor)

- Runs coding loops on the **operator’s machine** via outbound WSS
  (`agent-kernel-mcp` Host plugin → `/api/executor/ws`).
- Control plane never dials the PC. It enqueues `start` / `nudge` /
  `fetch_transcript` / `operator_turn` jobs; the device executes them.
- Pairing: one-time code in DSH Session Header → `connect.json`.

**Local-first → Docker server:** see [`runtime-topology.md`](runtime-topology.md).

## Claude Code / Aider / OpenCode

Same WSS job channel. Device-side `agent-kernel-mcp` (or standalone
`agent-kernel-runner`) routes by `brief.executorId`:

| `executorId` | Device command |
|--------------|----------------|
| `claude-code` | `claude --print …` |
| `aider` | `aider --message … --yes-always` |
| `opencode` | `opencode run --auto …` |

CLI must be on PATH (override with `AGENT_KERNEL_CLAUDE_BIN` /
`AGENT_KERNEL_AIDER_BIN` / `AGENT_KERNEL_OPENCODE_BIN`). Operator chat with
MCP tools still needs DSH preset `operator`, or set `operatorLlm=gateway`.

## Optional OpenAI-compatible GateWay (models)

- Not part of agent-kernel and not required. Any OpenAI-compatible HTTP front
  door works when you set `operatorLlm=gateway` (URL + key on My Executor).
- **Operator chat** is mode-explicit (`operatorLlm` on My Executor):
  - **`executor`** (default after pair) — LLM runs on the user's DSH via
    `operator_turn` (preset `operator`, MCP tools only). No GateWay required.
  - **`gateway`** — control plane calls that OpenAI-compat endpoint with
    operator tools (catalog / assignments / nudge). Use when you want chat
    without a coding runtime.
- Same optional endpoint can feed review proposals / embeddings later; coding
  models stay on the executor path (DSH → whatever models that stack uses).
- **Start policy** runs in the API so “start autonomous run” is authorized by
  control plane identity, not a raw DSH URL alone.

See [`ui.md`](ui.md) § “Two different chats” and
[`runtime-topology.md`](runtime-topology.md) § Operator chat LLM.

## AgentLayer (tools / security)

- Plugins: agents, skills, tools, dashboards, schedules.
- Wire as **workflow backends**: e.g. profile `workflow/security-scan` calls
  AgentLayer/SimpleSecCheck on the server; results → Observability + BUGS
  hints (human or fix-agent).
- Keep AgentLayer deploy independent; control plane is a client.

## autonomous-lab

- Proof of FIX→VALIDATE→FEATURE + Pages.
- Do **not** merge lab `src/` into products.
- Port failure modes into `lawpack/LESSONS.md` and profiles.

## PIDEA

- Source of **analysis / violation / LOC / layer** test ideas and content
  templates.
- **Storage lesson:** SQLite for local/dev, **Postgres for production**;
  prompts on **filesystem** (`content-library`) — mirrored in
  [ADR-0005](../adr/0005-persistence-sqlite-postgres.md) +
  [`../reference/data-model.md`](../reference/data-model.md).
- Do **not** resurrect full IDE-mirror UI or task-queue-as-SoT in v1.
- Optional later: import selected `content-library` frameworks as profile
  prompt packs (still files, not SQL SoT).

## Git hosts

- **BYO executor workspaces:** product trees live on the user's executor (DSH).
  Kernel registers an **opaque path** string (whatever the executor understands)
  — it never scans host FS, clones into a shared volume, or `existsSync`s
  workdirs. See [`runtime-topology.md`](runtime-topology.md).
- `gitRemote` is optional catalog metadata only.
- Remotes: GitHub OAuth/PAT for **identity**; branch policy stays in lawpack +
  control plane Profiles (mirrors LAWS).
