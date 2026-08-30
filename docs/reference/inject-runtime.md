# harness_inject runtime (materialization)

**Diátaxis:** reference. Modes: [ADR-0004](../adr/0004-dual-injection-multi-executor.md),
[`../explanation/operating-model.md`](../explanation/operating-model.md).

## Goal

At nudge time, make Lawpack content available to the executor **without**
committing it as product SoT.

## Steps (logical)

1. Resolve `lawpackPin` from project / Settings.  
2. Load pack files from control-plane pack store (versioned tree / tarball).  
3. Choose materialization (Settings / Brief):

| Mode | Where content appears | Git |
|------|----------------------|-----|
| Ephemeral dir | `$TMPDIR/ak-lawpack-<runId>/` or similar | never |
| Dot-agent mount | `<workdir>/.agent/lawpack/` | **MUST** be gitignored |
| Prompt-inline | Role text embedded in first prompt / Brief only | n/a |

4. Point Brief `rolesPath` / inject fields at that location.  
5. Start executor with `workdir` = product path.  
6. On session end: delete ephemeral dir; leave `.agent/lawpack/` untracked.

## TTL / cleanup

| Artifact | Lifetime |
|----------|----------|
| tmp pack dir | Session / run id; delete on success or fail finalize |
| `.agent/lawpack/` | During run; safe to wipe on next nudge |
| Brief snapshot on `Run` | Durable metadata only (hash/ref), not full tree |

## Non-goals

- Proxy-local durable pack cache as SoT  
- Writing `vendor/lawpack/` under `harness_inject` (that is `repo_plant`)  
