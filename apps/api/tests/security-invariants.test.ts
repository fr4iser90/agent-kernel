import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const apiSrc = join(process.cwd(), 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

describe('security invariants (no silent localhost oauth / auth bypass)', () => {
  it('api src must not hardcode GitHub OAuth callback to 127.0.0.1', () => {
    const files = walk(apiSrc)
    const hits: string[] = []
    for (const f of files) {
      const text = readFileSync(f, 'utf8')
      if (text.includes('127.0.0.1:8787/api/auth/github')) {
        hits.push(f)
      }
    }
    expect(hits).toEqual([])
  })

  it('settings default githubOAuthRedirectUri is null', async () => {
    const { DEFAULT_SETTINGS } = await import('../src/domain/settings/settings.js')
    expect(DEFAULT_SETTINGS.githubOAuthRedirectUri).toBeNull()
  })

  it('no password-less local-owner login mode in app routes', () => {
    const app = readFileSync(join(apiSrc, 'presentation/app.ts'), 'utf8')
    expect(app).not.toMatch(/mode\s*===\s*['"]local-owner['"]/)
    expect(app).not.toMatch(/local-owner/)
  })

  it('cors must not reflect unknown Origin', () => {
    const app = readFileSync(join(apiSrc, 'presentation/app.ts'), 'utf8')
    expect(app).not.toMatch(/\?\? origin\b/)
    expect(app).not.toMatch(/\?\? '\*'/)
  })

  it('catalog must not expose scan-local or github import routes', () => {
    const app = readFileSync(join(apiSrc, 'presentation/app.ts'), 'utf8')
    expect(app).not.toMatch(/scan-local/)
    expect(app).not.toMatch(/catalog\/github\/import/)
    const kernel = readFileSync(join(apiSrc, 'application/kernel.ts'), 'utf8')
    expect(kernel).not.toMatch(/scanLocalGitRoots/)
    expect(kernel).not.toMatch(/cloneGithubRepo/)
  })

  it('device pair codes use 12 chars (XXXX-XXXX-XXXX)', () => {
    const kernel = readFileSync(join(apiSrc, 'application/kernel.ts'), 'utf8')
    expect(kernel).toMatch(/raw\.slice\(0, 4\).*raw\.slice\(4, 8\).*raw\.slice\(8\)/s)
    expect(kernel).toMatch(/A-Z2-9\]\{4\}-\[A-Z2-9\]\{4\}-\[A-Z2-9\]\{4\}/)
  })

  it('sessions insert expires_at and never store access_token on session row', () => {
    const kernel = readFileSync(join(apiSrc, 'application/kernel.ts'), 'utf8')
    expect(kernel).toMatch(/INSERT INTO sessions[\s\S]*expires_at/)
    expect(kernel).toMatch(/VALUES \(\?, \?, \?, \?, \?, \?, NULL\)/)
  })

  it('WSS prefers Authorization Bearer before query token', () => {
    const ws = readFileSync(join(apiSrc, 'presentation/executor-ws.ts'), 'utf8')
    const bearerIdx = ws.indexOf("startsWith('bearer ')")
    const queryIdx = ws.indexOf("searchParams.get('token')")
    expect(bearerIdx).toBeGreaterThan(-1)
    expect(queryIdx).toBeGreaterThan(-1)
    expect(bearerIdx).toBeLessThan(queryIdx)
  })

  it('runtime site uses request Host / X-Forwarded-Proto (not COOKIE_SECURE for cookies)', () => {
    const app = readFileSync(join(apiSrc, 'presentation/app.ts'), 'utf8')
    expect(app).toMatch(/publicOriginFromRequest/)
    expect(app).toMatch(/requestIsHttps/)
    expect(app).not.toMatch(/COOKIE_SECURE === '1' \|\| process\.env\.NODE_ENV/)
  })

  it('profile mutate routes require admin', () => {
    const app = readFileSync(join(apiSrc, 'presentation/app.ts'), 'utf8')
    expect(app).toMatch(/app\.post\('\/api\/profiles'[\s\S]*?requireAdmin\(kernel, c\)/)
    expect(app).toMatch(/app\.patch\('\/api\/profiles\/:profileId'[\s\S]*?requireAdmin\(kernel, c\)/)
    expect(app).toMatch(/app\.delete\('\/api\/profiles\/:profileId'[\s\S]*?requireAdmin\(kernel, c\)/)
  })

  it('scheduler tick is admin-only', () => {
    const app = readFileSync(join(apiSrc, 'presentation/app.ts'), 'utf8')
    expect(app).toMatch(/app\.post\('\/api\/scheduler\/tick'[\s\S]*?requireAdmin\(kernel, c\)/)
  })

  it('logout revokes server session', () => {
    const app = readFileSync(join(apiSrc, 'presentation/app.ts'), 'utf8')
    expect(app).toMatch(/revokeSession/)
  })

  it('no GitHub username auto-link takeover', () => {
    const kernel = readFileSync(join(apiSrc, 'application/kernel.ts'), 'utf8')
    expect(kernel).toMatch(/Never auto-link by username/)
    expect(kernel).not.toMatch(/UPDATE users SET github_id = \?, github_login = \?, github_access_token = \?, updated_at = \? WHERE id = \?\`[\s\S]{0,80}byName/)
  })

  it('executor WSS requires device_pair provider', () => {
    const ws = readFileSync(join(apiSrc, 'presentation/executor-ws.ts'), 'utf8')
    expect(ws).toMatch(/provider !== 'device_pair'/)
    expect(ws).not.toMatch(/markExecutorPaired/)
  })
})
