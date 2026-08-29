# Adapter stub — web

Typical: TypeScript/JS SPA or SSR. **Not** tied to Vite; pin whatever the
product uses.

Example pin: `node-22 + pnpm + vite|next|astro`

Suggested gate shape:

```bash
pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build
# optional: pnpm run test:ui
```

Validate: prefer `deploy_url` (Pages, Vercel, …); else preview. Always
screenshot + vision when claiming UI PASS.

Lab lesson: one rAF / no stale position resets; measurable move ACCEPT; Floor-1
readability for 3D — encode such rules in the **product Initial**, not in the
kernel.
