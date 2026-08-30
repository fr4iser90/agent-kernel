# Roles index

Roles are **machine instructions** for the coding executor (via SessionBrief /
inject). Control-plane **profiles** (`tracking-cycle`, `docs-only`, …) point at
these files — they are not the same thing as Runbook scan rules.

## Core loop (product coding)

| Role | File | When |
|------|------|------|
| Followup | [`followup.md`](followup.md) | Default idle/resume loop |
| Fix | [`fix.md`](fix.md) | BUGS Open blockers |
| Feature | [`feature.md`](feature.md) | One implementation slice |
| Validate | [`validate.md`](validate.md) | Cadence / ship claims |
| Demo | [`demo.md`](demo.md) | Proof artifacts when required |
| Arch | [`arch.md`](arch.md) | Stack/layout pivot only |

## Cross-cutting (non-game)

| Role | File | When |
|------|------|------|
| Docs | [`docs.md`](docs.md) | README / `docs/` / Diátaxis gaps |
| Legal / Impressum | [`legal-impressum.md`](legal-impressum.md) | Legal pages, footer, privacy wiring |
| Security | [`security.md`](security.md) | Light hygiene sweep |

Game / playability ACCEPT overlays stay in [`../profiles/games.md`](../profiles/games.md)
— not in every role.

## Lawpack vs Runbook

| | Lawpack role | Runbook (sibling product) |
|--|--------------|---------------------------|
| Job | Tell the **agent** what to do this session | **Scan** repo against atomic rules |
| Output | Commits / PROGRESS / BUGS | Report / score / violations |
| Impressum | Agent creates/wires pages from operator facts | Rule may flag missing legal docs |

Thin product Followups: RUN_ID + Initial path + “obey lawpack roles/…”. Do not
paste full role text every night unless the harness cannot read files.
