# Start policy (in-process)

**Diátaxis:** reference.

Before `ExecutorPort.start/nudge`, the **API** runs allow/deny checks
(`apps/api/src/application/policy-authorize.ts`). **No** separate container,
**no** network sidecar, **no** optional HTTP service.

## Job

1. Brief is built by the kernel.
2. Authorize: project initialized, path exists, reviewMode valid.
3. Optional git/owned-path guards **only** if Settings enable them.
4. Then `ExecutorPort` (DSH v1).

```text
UI / chat / schedule
        │
        ▼
  agent-kernel API  (authorize in-process)
        │
        ▼
  ExecutorPort (dsh / …)
```

## Non-goals

- Not a coding agent
- Not GateWay
- Not Traefik auth
- **Not** a deployable sidecar / open network service
