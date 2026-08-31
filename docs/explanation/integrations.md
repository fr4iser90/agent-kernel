# Integrations

## DeepSeek Harness (executor)

- Runs coding loops; typically behind your Traefik / HTTPS edge (auth at edge).
- Control plane **does not embed** DSH source. It:
  - sets workdir to the product path,
  - starts/attaches sessions (**CLI or Host API** — DSH Web UI optional),
  - injects SessionBrief (RUN_ID, roles, gate, denylist),
  - records session id + outcome in Orchestration context.
- VS Code DSH extension remains the human sidecar; remote dashboard uses the
  same in-process start policy before ExecutorPort.

**Local-first → Docker server, volumes, git workspaces:** see
[`runtime-topology.md`](runtime-topology.md).

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

- **Local:** path + existing checkout first; `gitRemote` optional metadata.
- **Server (Docker):** provision is **git-first** — clone/fetch into a shared
  workspace volume both kernel and DSH mount (see
  [`runtime-topology.md`](runtime-topology.md)).
- Remotes: GitHub/`gh` optional helpers; branch policy stays in lawpack +
  control plane Profiles (mirrors LAWS).
