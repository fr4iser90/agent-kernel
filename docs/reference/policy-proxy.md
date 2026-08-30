# Policy proxy — contract

**Diátaxis:** reference. Runtime placement:
[`../explanation/architecture.md`](../explanation/architecture.md),
[`../explanation/runtime-topology.md`](../explanation/runtime-topology.md).
Source stub: [`../../services/policy-proxy/README.md`](../../services/policy-proxy/README.md).

**Docs phase:** this is the normative contract. Implementation may live inside
`apps/api` first; `services/policy-proxy` is the isolation target. **No** silent
git/protect policy — only Settings-enabled checks.

---

## Job

Authorize and shape an executor start/nudge:

1. Receive intent from control plane (assignment / run id).  
2. Load **SessionBrief** (pin, roles, gate, paths, `executorId`).  
3. Allow or deny start.  
4. Hand workdir + Brief to `ExecutorPort` (DSH v1).  
5. Optionally materialize `harness_inject` pack content for the session.

```text
UI / chat / schedule
        │
        ▼
  agent-kernel API (orchestration)
        │
        ▼
  policy-proxy  ──allow + Brief──►  ExecutorPort (DSH / …)
```

---

## Inputs / outputs (logical)

| Direction | Payload |
|-----------|---------|
| In | `projectId`, `assignmentId` / run intent, operator id |
| Out (allow) | SessionBrief + executor invoke args |
| Out (deny) | Stable error code + reason (no start) |

Brief fields follow the shared session-brief package / orchestration docs.
Git assert / owned-path verification run **only** when Settings enable them.

---

## Deployment

| Mode | Where proxy runs |
|------|------------------|
| v1 local | In-process module in `apps/api` (acceptable) |
| L-docker / remote | Optional Compose service `policy-proxy` on internal network |
| Traefik | **Not** public; only API → proxy → executor |

Compose profile `proxy` is a placeholder until the image exists — see
`deploy/compose.yml`.

---

## Non-goals

- Not a coding agent  
- Not GateWay  
- Not Traefik auth  
- Not Lawpack authoring  
