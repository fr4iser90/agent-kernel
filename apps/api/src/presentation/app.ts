import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'
import type { CatalogService } from '../application/catalog-service.js'

const registerSchema = z.object({
  name: z.string().min(1),
  localPath: z.string().min(1),
  gitRemote: z.string().nullable().optional(),
})

export function createApp(catalog: CatalogService): Hono {
  const app = new Hono()
  app.use(
    '*',
    cors({
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    }),
  )

  app.get('/health', (c) => c.json({ ok: true, service: 'agent-kernel-api' }))

  app.get('/api/projects', (c) => {
    return c.json({ projects: catalog.listProjects() })
  })

  app.post('/api/projects', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'invalid body', details: parsed.error.flatten() }, 400)
    }
    try {
      const project = catalog.registerProject(parsed.data)
      return c.json({ project }, 201)
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'failed' }, 400)
    }
  })

  return app
}
