# Web / compliance overlay (optional)

Optional pack overlay for sites that need docs + legal surfaces — **not** the
game lab profile.

Generic laws: [`../LAWS.md`](../LAWS.md).  
Roles: [`../roles/docs.md`](../roles/docs.md),
[`../roles/legal-impressum.md`](../roles/legal-impressum.md),
[`../roles/security.md`](../roles/security.md).

## Suggested control-plane profiles

| Profile id | Primary role | Schedule hint |
|------------|--------------|---------------|
| `docs-only` | `roles/docs.md` | cron / manual |
| `legal-impressum` | `roles/legal-impressum.md` | once / on_event |
| `security-sweep` | `roles/security.md` | cron weekly |

## Operator must supply

For legal role: identity facts in Initial / `LEGAL.md` (name, address, contact,
….). Missing facts → agent opens BUGS `human`, does not invent them.

## Optional external checks

ADAPTER may point at Runbook scan, Local-WebChecker, or similar — agent runs
what ADAPTER names; Lawpack does not embed those engines.
