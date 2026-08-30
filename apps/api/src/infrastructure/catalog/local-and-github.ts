import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import type { Project } from '../../domain/catalog/project.js'
import type { ProjectRepository } from '../../domain/catalog/project-repository.js'
import { GitHubClient, type GhRepo } from '../github/github-client.js'
import { randomUUID } from 'node:crypto'

export function scanLocalGitRoots(root: string): { name: string; path: string; gitRemote: string | null }[] {
  const abs = resolve(root)
  if (!existsSync(abs)) throw new Error(`scan path missing: ${abs}`)
  const skip = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
  ])
  const out: { name: string; path: string; gitRemote: string | null }[] = []
  for (const name of readdirSync(abs)) {
    if (skip.has(name) || name.startsWith('.')) continue
    if (name.endsWith('.zip') || name.endsWith('.AppImage')) continue
    const full = join(abs, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (!st.isDirectory()) continue
    if (!existsSync(join(full, '.git'))) continue
    let gitRemote: string | null = null
    try {
      gitRemote = execFileSync('git', ['-C', full, 'remote', 'get-url', 'origin'], {
        encoding: 'utf8',
      }).trim()
    } catch {
      gitRemote = null
    }
    out.push({ name, path: full, gitRemote })
  }
  return out
}

export function registerScanResults(
  projects: ProjectRepository,
  ownerId: string,
  found: { name: string; path: string; gitRemote: string | null }[],
): { registered: Project[]; skipped: { name: string; reason: string }[] } {
  const existing = projects.listByOwner(ownerId)
  const byPath = new Map(existing.map((p) => [p.localPath, p]))
  const registered: Project[] = []
  const skipped: { name: string; reason: string }[] = []
  const now = new Date().toISOString()
  for (const f of found) {
    if (byPath.has(f.path)) {
      skipped.push({ name: f.name, reason: 'already_registered' })
      continue
    }
    const p = projects.create({
      id: randomUUID(),
      ownerId,
      name: f.name,
      localPath: f.path,
      gitRemote: f.gitRemote,
      now,
    })
    registered.push(p)
  }
  return { registered, skipped }
}

export function cloneGithubRepo(input: {
  repo: GhRepo
  cloneRoot: string
  token: string
}): string {
  mkdirSync(input.cloneRoot, { recursive: true })
  const dest = join(input.cloneRoot, input.repo.name)
  if (existsSync(join(dest, '.git'))) return dest
  if (existsSync(dest)) {
    throw new Error(`clone dest exists but is not a git repo: ${dest}`)
  }
  const url = input.repo.clone_url.replace(
    'https://',
    `https://x-access-token:${input.token}@`,
  )
  execFileSync('git', ['clone', '--depth', '1', url, dest], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  // scrub token from remote
  try {
    execFileSync('git', ['-C', dest, 'remote', 'set-url', 'origin', input.repo.clone_url], {
      stdio: 'ignore',
    })
  } catch {
    /* ignore */
  }
  return dest
}

export async function fetchGithubReposForImport(
  token: string,
  opts: { visibility: 'all' | 'public'; login?: string },
): Promise<GhRepo[]> {
  const gh = new GitHubClient(token)
  const me = await gh.me()
  if (opts.visibility === 'public') {
    const login = opts.login ?? me.login
    return gh.listPublicRepos(login)
  }
  // all = owner repos including private
  return gh.listUserRepos({ visibility: 'all', affiliation: 'owner' })
}
