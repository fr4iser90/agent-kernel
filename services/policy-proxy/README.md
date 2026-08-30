# Policy proxy

Sidecar (or in-process module) that **authorizes** and **injects SessionBrief**
before an executor run (DSH v1).

**Normative contract (docs):**  
[`../../docs/reference/policy-proxy.md`](../../docs/reference/policy-proxy.md)

## Status (docs-architecture phase)

| Item | State |
|------|--------|
| Contract / placement | Specified in docs |
| In-process API module | Allowed for v1 |
| Standalone service in this folder | **Not implemented yet** — folder is the future home |
| Compose `policy-proxy` profile | Placeholder image until build exists |

## Responsibility

- Allow/deny start from control-plane intent  
- Attach SessionBrief + workdir to `ExecutorPort`  
- Honor Settings for optional git/path guards (default off)  
- Support `harness_inject` materialization at session start  

## Not this service

Lawpack editing, GateWay, Traefik, dashboard UI, product CI.
