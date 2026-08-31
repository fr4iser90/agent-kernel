/**
 * Catalog helpers — GitHub listing + match against device workdirs.
 * Project trees live on the executor; kernel never scans or clones product workspaces.
 */
import { GitHubClient, type GhRepo } from '../github/github-client.js'

export type DeviceWorkdirCandidate = {
  path: string
  name: string
  source: string
  gitRemote: string | null
}

export type GithubRepoMatch = {
  id: number
  name: string
  fullName: string
  private: boolean
  htmlUrl: string
  cloneUrl: string
  sshUrl: string
  defaultBranch: string
  description: string | null
  /** on_device = local path matched; missing = GitHub-only (not executor-ready). */
  match: 'on_device' | 'missing'
  localPath: string | null
  matchReason: 'git_remote' | 'basename' | null
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
  return gh.listUserRepos({ visibility: 'all', affiliation: 'owner' })
}

/** Normalize git remotes for equality (https vs ssh, trailing .git). */
export function normalizeGitRemote(url: string): string {
  let u = url.trim().toLowerCase()
  u = u.replace(/\.git$/, '')
  u = u.replace(/^git\+/, '')
  u = u.replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/')
  u = u.replace(/^git@github\.com:/, 'https://github.com/')
  u = u.replace(/^ssh:\/\/git@([^/]+)\//, 'https://$1/')
  u = u.replace(/^git@([^:]+):/, 'https://$1/')
  return u.replace(/\/+$/, '')
}

function basenameOf(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || p
}

export function matchGithubReposToDevice(
  repos: GhRepo[],
  candidates: DeviceWorkdirCandidate[],
): GithubRepoMatch[] {
  return repos.map((repo) => {
    const cloneN = normalizeGitRemote(repo.clone_url)
    const sshN = normalizeGitRemote(repo.ssh_url)
    let localPath: string | null = null
    let matchReason: 'git_remote' | 'basename' | null = null

    for (const c of candidates) {
      if (c.gitRemote) {
        const remoteN = normalizeGitRemote(c.gitRemote)
        if (remoteN === cloneN || remoteN === sshN) {
          localPath = c.path
          matchReason = 'git_remote'
          break
        }
      }
    }
    if (!localPath) {
      const want = repo.name.toLowerCase()
      for (const c of candidates) {
        if (basenameOf(c.path).toLowerCase() === want || c.name.toLowerCase() === want) {
          localPath = c.path
          matchReason = 'basename'
          break
        }
      }
    }

    return {
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
      htmlUrl: repo.html_url,
      cloneUrl: repo.clone_url,
      sshUrl: repo.ssh_url,
      defaultBranch: repo.default_branch,
      description: repo.description,
      match: localPath ? 'on_device' : 'missing',
      localPath,
      matchReason,
    }
  })
}

export type { GhRepo }
