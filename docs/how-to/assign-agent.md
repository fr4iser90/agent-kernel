# Assign an agent to a project

**Diátaxis:** how-to. Terms: [`../explanation/orchestration.md`](../explanation/orchestration.md).
UI: [`../explanation/ui.md`](../explanation/ui.md) (Project → Agents).

## Goal

Bind a profile to a project with schedule + review mode so orchestration can
nudge it.

## Steps (Web UI)

1. Login → open **Project** detail (or **Agents** for global assign).  
2. **Add assignment**: choose `profileId` (e.g. `tracking-cycle`).  
3. Set `scheduleMode` (`manual` \| `once` \| `infinite` \| `cron` \| `on_event`).  
4. Set `reviewMode` (default `human`).  
5. Optional: `runId` (else from Settings `runIdPattern` at first run).  
6. Save. Assignment appears on the project; Overview can list it.

## Steps (API)

Same resources the UI uses (when implemented): create/update assignment on
`projectId` with profile + schedule + reviewMode. No side channel.

## You have succeeded when…

- Project detail shows the assignment (not paused).  
- Brief dry-run resolves for that assignment.  
- Global assignments (if used) expand to the intended project set.
