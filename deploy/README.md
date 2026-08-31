# Deploy — agent-kernel Compose

Control plane only (API + Web). The executor (DSH) is a **separate** product —
pair it over outbound WSS; do not mount it from this folder.

## Profiles

| File | When |
|------|------|
| `compose.yml` | Local Docker (loopback ports) |
| `compose.server.yml` | Override on a host that already runs Traefik |

## One env file per machine

| Machine | File | What stays in env |
|---------|------|-------------------|
| **Laptop** | `deploy/.env` | Ports, optional `WEB_ORIGIN` for pair, GitHub secrets |
| **Server** | `deploy/.env.server` | Traefik `WEB_HOST` / `API_HOST`, `WEB_ORIGIN` for pair, GitHub secrets |

**Runtime auto (no env):** Cookie `Secure`, CORS allowlist, OAuth callback redirect — from `Host` + `X-Forwarded-Proto` (what Traefik already sends).

**Still env (cannot detect):** Traefik hostnames in `compose.server.yml`, GitHub client id/secret, public URL for device-pair (DSH has no browser request).

```bash
# Local
cp deploy/.env.example deploy/.env   # optional
docker compose -f deploy/compose.yml --env-file deploy/.env up --build

# Server (Traefik already running)
cp deploy/.env.server.example deploy/.env.server   # fill secrets once
docker compose -f deploy/compose.yml -f deploy/compose.server.yml \
  --env-file deploy/.env.server up -d --build
```

After `Dockerfile.api` / web changes: always `--build`.

DNS A/AAAA for `WEB_HOST` + `API_HOST` must exist before Traefik can get certs.  
GitHub OAuth callback must match `GITHUB_REDIRECT_URI`.

Optional Postgres (`--profile postgres`): set `DATABASE_URL` in `.env.server`.

## What is *not* here

| Concern | Where |
|---------|--------|
| Traefik | Host / GateWay stack |
| DSH / executor | Separate repo / install — pair via UI |
| Project workspaces | On the executor only |
| Auth IdP | Traefik middleware (optional) |

## Services

| Service | Image | Role |
|---------|-------|------|
| `api` | `Dockerfile.api` | Control plane |
| `web` | `Dockerfile.web` | UI (+ `/api` proxy) |
