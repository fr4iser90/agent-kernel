FIX-ONLY — playability. No new features.
Branch FIXED: agent/{{slug}}-{{YYYYMMDD}}
NEVER create agent/*-v2, -p*, -rebased, or a second PR.

Append to BUGS.md ## Open, drain via roles/fix.md, then validate
(roles/validate.md) once. No workflow edits.

B-?? `playability` `blocker`: {{short title}}
Repro: {{steps on deploy_url or preview}}
Observed: {{what is wrong}}
Expected: {{measurable}}
Likely areas: {{files/systems — optional root cause if known}}
FIX: {{constraints — e.g. one rAF, do not redesign genre}}
ACCEPT:
- {{metric 1}}
- {{metric 2}}
- gate green; BUGS → Fixed with SHA + cause
- After land: wait deploy_lag; re-check live surface

PROGRESS NOW: FIX-FIRST this bug only until Open empty.
