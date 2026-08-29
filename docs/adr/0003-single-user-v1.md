# ADR-0003: Single-user v1, multi-user-ready schema

## Status

**Accepted** (2026-08-29)

## Context

The control plane will run local-first, later optionally beside DSH behind
Traefik. Full multi-user (login, ACL, audit) early risks repeating PIDEA-style
scope before Catalog/Init/Dashboard work. Pure single-user with no `ownerId`
makes a later multi-user migration painful.

## Decision

| Phase | Auth / tenancy |
|-------|----------------|
| **v1 (local)** | **Single operator** — no login UI; dashboard bound to localhost |
| **Schema** | Implicit `local-owner` user; entities carry `ownerId` from day one |
| **M6 (remote)** | Real login (prefer reuse LocalAI-GateWay users/OIDC later) + ACL + audit |

Rules:

1. Domain `identity` exists as a stub; v1 always resolves to one owner.  
2. Do not build teams/roles UI in M1–M5.  
3. Policy proxy / DSH nudge still attributed to that owner for future audit.  
4. Remote deploy must not expose an unauthenticated dashboard on the public net.

## Consequences

- Faster path to project list + Init + Lawpack pin.  
- Soft migration to multi-user without rewriting core tables.  
- M6 is explicitly the auth/ACL milestone (see ROADMAP).
