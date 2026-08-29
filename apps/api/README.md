# API (control plane)

**Stack:** TypeScript (Hono or Fastify) + SQLite — [ADR-0002](../../docs/adr/0002-stack-pin.md).

Layers: `presentation` → `application` → `domain` ← `infrastructure`.

Serves the **web dashboard** and later the policy proxy / DSH session brief.
Not a CLI-first admin tool.
