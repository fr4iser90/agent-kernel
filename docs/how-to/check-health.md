# Check control-plane health

**Diátaxis:** how-to.

## Goal

Verify API (and optionally Web) respond after `pnpm dev` or Compose up.

## Steps

```bash
# API default http://127.0.0.1:8787
./scripts/health.sh

# Custom API + Web
API_BASE=http://127.0.0.1:8787 WEB_BASE=http://127.0.0.1:8080 ./scripts/health.sh

# or
pnpm health
```

Expect `health: OK` and HTTP success on `GET /health`
(`{ "ok": true, "service": "agent-kernel-api" }`).

## You have succeeded when…

- Script exits 0  
- `/health` returns JSON ok  
- Optional: Web base returns HTTP 200 when `WEB_BASE` is set  
