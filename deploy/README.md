# Deploy — agent-kernel Compose

Canonical Docker layout for the control plane. Matches
[`docs/reference/naming.md`](../docs/reference/naming.md) and
[`docs/explanation/runtime-topology.md`](../docs/explanation/runtime-topology.md).

## Profiles

| File | Topology | Ingress |
|------|----------|---------|
| `compose.yml` | **L-docker** (local) | Loopback ports only |
| `compose.server.yml` | **S** (remote) override | Existing Traefik labels; optional `--profile postgres` |

```bash
# Local (L-docker) — SQLite on ak-data
cp deploy/.env.example deploy/.env   # optional; defaults work without
docker compose -f deploy/compose.yml up --build

# Remote (S) — Traefik attach (DNS A/AAAA for WEB_HOST + API_HOST must exist first)
cp deploy/.env.server.example deploy/.env.server   # fill secrets
mkdir -p "${WORKSPACE_ROOT:-/home/docker/docker/agent-kernel/workspaces}"
docker compose -f deploy/compose.yml -f deploy/compose.server.yml \
  --env-file deploy/.env --env-file deploy/.env.server up -d --build

# Required DNS (same IP as fr4iser-deepseek.fr4iser.com / Traefik):
#   agent-kernel.fr4iser.com
#   api.agent-kernel.fr4iser.com
# GitHub OAuth App callback must match GITHUB_REDIRECT_URI.

# Remote + Postgres (ADR-0005)
# Set DATABASE_URL=postgres://agent:agent@postgres:5432/agent_kernel in .env.server
docker compose -f deploy/compose.yml -f deploy/compose.server.yml \
  --env-file deploy/.env --env-file deploy/.env.server --profile postgres up -d --build
```

Native host still uses `pnpm dev` from the repo root (L-native).

## What is *not* in this folder

| Concern | Where it lives |
|---------|----------------|
| Traefik binary / static config | Host / GateWay (or DSH) Compose — **external** |
| DSH / GateWay | Sibling stacks — wire via **Settings** (UI/API), not deploy `.env` |
| Auth IdP | Host Traefik middleware / GateWay users |

`compose.server.yml` only adds Traefik **Docker labels** + joins the external `proxy` network so an already-running Traefik can discover the API/Web containers.

## Services

| Service | Image build | Default publish |
|---------|-------------|-----------------|
| `api` | `Dockerfile.api` | `8787` |
| `web` | `Dockerfile.web` | `5173` (dev) / `8080` (static) |

Start checks (init/path/optional git policy) run **in-process** in the API before `ExecutorPort` — no sidecar container.

## Local DSH for ExecutorPort

```bash
cd ~/Documents/Git/deepseek-harness
docker build -f deploy/Dockerfile -t dsh-web:local .
mkdir -p /tmp/dsh-ws /tmp/dsh-data
cp deploy/settings.yaml /tmp/dsh-data/settings.yaml
cd ~/Documents/Git/agent-kernel
docker compose -f deploy/compose.dsh-local.yml up -d
```

Then in agent-kernel Setup wizard:

- `dshEndpoint`: `http://127.0.0.1:13080`
- `dshTrustedHost`: `127.0.0.1:13080` (must match URL host — use the same host form)
- Basic auth empty for local

**Host note:** URL host and `dshTrustedHost` must be identical (`127.0.0.1:13080` **or** `localhost:13080`, not mixed). Set DSH `TRUSTED_HOST` to the same value.

Remote Traefik: set endpoint to `https://fr4iser-deepseek.fr4iser.com` and fill basic auth.
