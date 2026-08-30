# Project analyzer & operator preferences

What metadata we collect today, what to add (age, churn, stack depth, deprecation),
how **operator preferences** weight suggestions for “replace human effort with
agents”, and how we check that agents actually follow those preferences.

Related: Init sniff in [`init.md`](../how-to/init.md), catalog domain, Overview widgets
in [`ui.md`](../explanation/ui.md).

**Docs language: English only.**

---

## 1. What we have today (sniff only)

`FsProjectSniffer` / `POST /api/projects/:id/sniff` fills `Project.meta`:

| Signal | Today |
|--------|--------|
| `repoKind` | single / monorepo / unknown |
| `monorepoTool` | pnpm, nx, … |
| `packageManager` | pnpm, npm, cargo, … |
| `stackPin` | coarse (react+vite+ts, python, …) |
| `gateCommand` | guessed from scripts/Makefile |
| `hasCi` | `.github/workflows` etc. present |
| `workspaces[]` | apps/packages listing |
| `suggestedProfileId` | currently almost always `tracking-cycle` |
| `sniffedAt` | timestamp |

That is **enough for Init**, not enough for cross-project triage or preference-based
recommendations.

---

## 2. Analyzer = sniff + richer signals

Put extended collection in **Catalog** (read-only facts) under a
`ProjectAnalyzer` (sniff is the fast subset). Score/recommend in
**Observability** (or a thin `preferences` module) so domain stays clean:

```text
ProjectAnalyzer.analyze(path) → ProjectFacts
PreferenceEngine.score(facts, OperatorPreferences) → ProjectAdvice
PreferenceCompliance.check(project, assignment, runHistory) → ComplianceReport
```

### Proposed facts (deterministic first; LLM optional gloss)

| Category | Examples | How |
|----------|----------|-----|
| **Freshness** | last commit date, last author, days since touch | `git log -1` |
| **Age** | first commit / repo create | `git rev-list --max-parents=0` |
| **Churn** | commits 90d, files changed | `git shortlog` / log stats |
| **Size** | LOC approx, file count, largest dirs | walk or `cloc`-lite; skip `node_modules` |
| **Stack depth** | DDD-ish layers? (`domain/`, `application/`, …), frameworks | path heuristics + manifests |
| **Hygiene** | README, LICENSE, lockfile, tests present | file probes |
| **CI health** | workflows exist; optional last status later | detect now; API later |
| **Deprecation** | archived remote, `DEPRECATED.md`, no commits N months | heuristics + user flag |
| **Autonomy ready** | PROGRESS/BUGS/ADAPTER present, lawpack pin, gate | Init/meta |
| **Risk** | secrets patterns, huge binaries, no gate | cheap scans |
| **Human-owned** | `.github/workflows` density | OWNED_PATHS alignment |

Store on project as `facts_json` + `factsAt` (refresh on demand / cron). Schema:
[`schemas/project-facts.schema.json`](schemas/project-facts.schema.json).
Do not block Init on full analyze — **sniff ⊆ analyze**.

User tags (manual): `deprecated`, `active`, `playground`, `prod` — override
heuristics.

---

## 3. Operator preferences (global + project override)

Preferences answer: **what should agents optimize for on my behalf?**

```ts
type OperatorPreferences = {
  // Architecture
  preferDddAboveLoc?: number          // e.g. 5_000 — suggest arch/profile if bigger
  preferThinRepos?: boolean         // favor harness_inject strict / little vendor
  preferMonorepoSplitAbovePackages?: number

  // Autonomy
  preferProfiles?: string[]           // e.g. ['tracking-cycle','fix-only']
  preferScheduleDefault?: ScheduleMode
  autoSuggestHumanReplacement?: boolean

  // Quality bars agents must respect
  requireGateGreenBeforeAccept?: boolean
  forbidWorkflowEdits?: boolean       // mirror OWNED_PATHS
  preferStackPins?: string[]          // e.g. ['typescript','pnpm']
  avoidStacks?: string[]              // soft warn

  // Triage weights (0–1, sum need not be 1)
  weights?: {
    staleDays?: number                // older → higher “needs agent or archive”
    size?: number
    missingGate?: number
    missingTests?: number
    dddFit?: number
    thinRepoFit?: number
    churn?: number
  }
}
```

- **Global** in Settings.  
- **Project override** optional (e.g. this toy repo: no DDD preference).  
- Preferences are **not** Lawpack — they steer *control-plane advice* and
  Brief hints; laws stay in `lawpack/`.

---

## 4. Scoring → “human replacement” suggestions

**Human replacement** here means: propose an Assignment / schedule / Init mode
so an agent takes over grunt work the human would have done — not deleting the
human from review forever (`reviewMode` still applies).

Example advice outputs:

| Advice kind | When | Suggest |
|-------------|------|---------|
| `init_now` | registered, no pin | run Init (preset from prefs: Clean if `preferThinRepos`) |
| `assign_fix_only` | BUGS open or gate red | fix-only + on_event |
| `assign_tracking_cycle` | active product, mid size, gate exists | tracking-cycle + cron/infinite |
| `assign_docs` | stale README, low churn | docs profile + manual/cron |
| `consider_archive` | deprecated / no commits 365d | no agent; mark deprecated |
| `split_or_ddd` | LOC > preferDddAboveLoc, flat structure | arch profile / human ADR |
| `add_gate` | no gateCommand | human or agent to add gate script |

Score = weighted sum of normalized facts vs preferences. UI shows top N on
Overview + project detail (“Suggested next”). LLM operator chat can call
`GET /api/projects/:id/advice` as a tool.

Always **suggest, don’t auto-assign** unless user opts into
`llm_auto` / auto-apply prefs (default off).

---

## 5. Preference compliance (“do agents honor me?”)

After runs, check Brief + outcomes against preferences:

| Check | Signal |
|-------|--------|
| Workflow edits | git paths under `.github/workflows` in run diff → fail if `forbidWorkflowEdits` |
| Stack drift | ADAPTER/PROGRESS stack_pin changed vs prefer/avoid lists |
| Gate skipped | ACCEPT without gate green when `requireGateGreenBeforeAccept` |
| Fat repo plant | `repo_plant` used while `preferThinRepos` → warn |
| Wrong profile | security cron never run on high-risk facts → nudge |

Surfaces: project Health widget, Runs page, operator chat (“compliance”).

---

## 6. API sketch

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/projects/:id/sniff` | fast (exists) |
| POST | `/api/projects/:id/analyze` | full facts refresh |
| GET | `/api/projects/:id/facts` | last facts |
| GET | `/api/settings/preferences` | operator prefs |
| PUT | `/api/settings/preferences` | update prefs |
| GET | `/api/projects/:id/advice` | scored suggestions |
| GET | `/api/advice` | ranked across projects |
| GET | `/api/projects/:id/compliance` | last compliance report |

Same endpoints = UI + LLM tools.

---

## 7. Where it lives in the tree

| Piece | Domain |
|-------|--------|
| Sniff + analyze facts | `catalog` |
| Preferences schema + scoring | `observability` or `preferences` (thin) |
| Compliance vs runs | `observability` + `orchestration` |
| UI | Overview attention + project Health + Settings → Preferences |

Steal **heuristics** from PIDEA analysis steps (repo type, tech stack) — not the
orchestrator runtime. Heavy security/LOC suites stay optional AgentLayer
workflows, not Init blockers.

---

## 8. Ship order

1. Keep sniff for Init.  
2. Add facts: git last commit, size band, deprecated flag, test/README probes.  
3. Settings → Preferences (thinRepos, DDD threshold, weights).  
4. `/advice` + Overview suggestions.  
5. Compliance checks on nudge/run.  
6. Optional LLM gloss on advice (“why this score”).

---

## Summary

- **Today:** Init sniff only.  
- **Next:** analyzer facts + **operator preferences** + weighted advice for
  agent assignments (“human replacement” suggestions).  
- **Also:** compliance that agents respect those prefs (workflows, gate, thin
  repo, stack).  
- Yes — this belongs with **project analyzer** gear, not inside Lawpack MD.
