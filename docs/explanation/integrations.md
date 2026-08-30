# Integrations

## DeepSeek Harness (executor)

- Runs coding loops; already on server Traefik:
  `https://fr4iser-deepseek.fr4iser.com/` (auth at edge).
- Control plane **does not embed** DSH source. It:
  - sets workdir to the product path,
  - starts/attaches sessions (**CLI or Host API** — DSH Web UI optional),
  - injects SessionBrief (RUN_ID, roles, gate, denylist),
  - records session id + outcome in Orchestration context.
- VS Code DSH extension remains the human sidecar; remote dashboard uses the
  same in-process start policy before ExecutorPort.

**Local-first → Docker server, volumes, git workspaces:** see
[`runtime-topology.md`](runtime-topology.md).

## LocalAI-GateWay (models)

- OpenAI-compatible front door + login + API keys (you already have this).
- Control plane uses GateWay for:
  - **operator chat** (LLM + tools over catalog / assignments / nudge),
  - optional LLM-assisted init (stack guess),
  - embeddings for Knowledge/codegraph (llama.cpp backends behind GateWay).
- Product **coding** agents may use GateWay **through DSH** as today (separate
  path from operator chat).
- **Start policy** runs in the API so “start autonomous run” is authorized by
  control plane identity, not a raw DSH URL alone.

See [`ui.md`](ui.md) § “Two different chats”.

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
