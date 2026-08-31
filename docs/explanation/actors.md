# Actors — human vs AI (who needs what)

**Diátaxis:** explanation. Canonical product terms:
[`orchestration.md`](orchestration.md). UI chats: [`ui.md`](ui.md).

One page for **ownership**: who decides, who configures, who codes, who only
reads docs.

---

## Cast

| Actor | What it is | Not |
|-------|------------|-----|
| **Human operator** | You — owns Settings, Login, Init confirm, ACCEPT/kill | Not the coding loop |
| **Control plane** (agent-kernel) | Catalog, Settings, Assignments, Brief, nudge, Overview | Not the product’s coding agent |
| **Operator LLM** | Control-plane chat: `operatorLlm=executor` (DSH preset + MCP tools) or `gateway` (OpenAI-compat) — same actions as UI buttons | Not product coding chat; not Lawpack roles |
| **Coding agent** (executor) | DSH v1 / later Claude/Pi — edits **product** repos | Not agent-kernel dashboard logic |
| **Lawpack** | Versioned law/role **content** | Not Settings, not the executor |
| **GateWay** | Models | Not policy |
| **Traefik / host** | Ingress on remote | Not shipped inside this repo |

---

## Who needs which docs

| Reader | Start here | Then |
|--------|------------|------|
| **Human (install)** | [`../tutorials/getting-started.md`](../tutorials/getting-started.md) | Settings UI, Init how-to |
| **Human (day-2 ops)** | [`orchestration.md`](orchestration.md), [`ui.md`](ui.md) | assign / nudge how-tos |
| **Human (policy knobs)** | [`../reference/settings.md`](../reference/settings.md) | [`settings-ui.md`](settings-ui.md) |
| **Coding agent (in a product)** | Planted/injected `LAWS.md` + roles | `PROGRESS` / Brief — **not** control-plane `docs/` |
| **Operator LLM** | OpenAPI / Init+Settings schemas | Same APIs as the Web UI |
| **Maintainer (this repo)** | [`architecture.md`](architecture.md), ADRs, [`doc-freeze.md`](doc-freeze.md) | tree, naming, gate |

Control-plane `docs/**` are for **humans and operator tools** building/running
agent-kernel. Product coding agents should **not** be pointed at the whole
`docs/` tree as law — only Lawpack + Brief.

---

## Who owns which decisions

| Decision | Owner |
|----------|--------|
| Enable git assert / protect / hooks | **Human** via Settings (default off) |
| Injection mode / tracking preset | **Human** (Settings → snapshot at Init) |
| Law/role wording | **Human** (edit Lawpack; agents obey) |
| When to nudge | **Human** schedule / button / operator chat |
| How to implement the feature | **Coding agent** inside the product workdir |
| CI / deploy YAML | **Human** (hard stop in LAWS) |
| SessionBrief allow/deny start | **Control plane** (in-process start policy) |
| Model weights / keys | **Human** / GateWay secrets |

---

## AI roles (do not collapse)

```text
Operator LLM ──tools──► agent-kernel API ──nudge──► ExecutorPort
                                                      │
                                                      ▼
                                              Coding agent in product
                                              (reads Lawpack / Brief)
```

| AI | Reads | Writes |
|----|-------|--------|
| Operator LLM | API + Settings | Assignments, nudge, Init drafts (reviewMode) |
| Coding agent | LAWS, roles, PROGRESS, product source | Product source + tracking (per preset) |

---

## Related

- Dual injection: [ADR-0004](../adr/0004-dual-injection-multi-executor.md)  
- Start policy: [`../reference/start-policy.md`](../reference/start-policy.md)  
- Generic vs game overlay: `lawpack/LAWS.md` + `lawpack/profiles/games.md`  
