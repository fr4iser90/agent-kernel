# Backup and restore (control-plane data)

**Diátaxis:** how-to. Store map: [`../reference/data-model.md`](../reference/data-model.md).

## SQLite (local)

```bash
# Stop API first (or accept brief inconsistency)
cp "$DB_PATH" "./backup-agent-kernel-$(date +%Y%m%d).db"
# Default path often apps/api/data/agent-kernel.db or Compose volume ak-data
```

Restore: stop API, replace DB file, start API.

## Postgres (server)

Use `pg_dump` / restore against `DATABASE_URL`. Volume snapshots of the
Postgres data dir are also fine.

## What this does *not* back up

Product git clones, Lawpack git history, GateWay, DSH session disks — back those
up with their own stacks.
