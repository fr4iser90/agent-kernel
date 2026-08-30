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

# Remote (S) — Traefik attach
cp deploy/.env.server.example deploy/.env.server
docker compose -f deploy/compose.yml -f deploy/compose.server.yml \
  --env-file deploy/.env --env-file deploy/.env.server up -d --build

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
| `policy-proxy` | optional profile | internal |

DSH and GateWay stay **external**. Configure their URLs in **Settings**
(after Login / setup wizard), not in this `.env`.

## Volumes

- `ak-data` — SQLite when `DATABASE_URL` unset  
- `ak-pgdata` — Postgres data when `--profile postgres`  
- `WORKSPACE_ROOT` — optional bind-mount for product clones  
