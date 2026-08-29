# API (control plane)

**Stack:** TypeScript + Hono + better-sqlite3 — [ADR-0002](../../docs/adr/0002-stack-pin.md), [ADR-0003](../../docs/adr/0003-single-user-v1.md).

```bash
pnpm --filter @agent-kernel/api dev   # http://127.0.0.1:8787
```

Layers: `presentation` → `application` → `domain` ← `infrastructure`.

v1: `GET/POST /api/projects` for local-owner catalog.
