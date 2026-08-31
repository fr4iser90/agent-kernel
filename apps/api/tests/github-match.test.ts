import { describe, expect, it } from 'vitest'
import {
  matchGithubReposToDevice,
  normalizeGitRemote,
  type DeviceWorkdirCandidate,
} from '../src/infrastructure/catalog/local-and-github.js'
import type { GhRepo } from '../src/infrastructure/github/github-client.js'
import { normalizeUserExecutorSettings } from '../src/domain/identity/user.js'

function repo(partial: Partial<GhRepo> & Pick<GhRepo, 'name' | 'full_name'>): GhRepo {
  return {
    id: partial.id ?? 1,
    name: partial.name,
    full_name: partial.full_name,
    private: partial.private ?? false,
    html_url: partial.html_url ?? `https://github.com/${partial.full_name}`,
    clone_url: partial.clone_url ?? `https://github.com/${partial.full_name}.git`,
    ssh_url: partial.ssh_url ?? `git@github.com:${partial.full_name}.git`,
    default_branch: partial.default_branch ?? 'main',
    description: partial.description ?? null,
    pushed_at: null,
    language: null,
  }
}

describe('detectRoots + github match', () => {
  it('normalizes detectRoots on user executor settings', () => {
    const s = normalizeUserExecutorSettings({
      detectRoots: [' /a/b ', '', '/a/b', '/c/d'],
    })
    expect(s.detectRoots).toEqual(['/a/b', '/c/d'])
  })

  it('rejects non-array detectRoots', () => {
    expect(() =>
      normalizeUserExecutorSettings({ detectRoots: '/oops' as unknown as string[] }),
    ).toThrow(/detectRoots must be an array/)
  })

  it('normalizes git remotes for match', () => {
    expect(normalizeGitRemote('git@github.com:fr4iser90/agent-kernel.git')).toBe(
      'https://github.com/fr4iser90/agent-kernel',
    )
    expect(normalizeGitRemote('https://github.com/fr4iser90/agent-kernel.git')).toBe(
      'https://github.com/fr4iser90/agent-kernel',
    )
  })

  it('matches on_device via git remote, else basename; else missing', () => {
    const device: DeviceWorkdirCandidate[] = [
      {
        path: '/home/u/ALLEREPOS/agent-kernel',
        name: 'agent-kernel',
        source: 'detect-roots',
        gitRemote: 'git@github.com:fr4iser90/agent-kernel.git',
      },
      {
        path: '/tmp/orphan-name-match',
        name: 'PublicOne',
        source: 'dsh-session',
        gitRemote: null,
      },
    ]
    const matched = matchGithubReposToDevice(
      [
        repo({ id: 1, name: 'agent-kernel', full_name: 'fr4iser90/agent-kernel' }),
        repo({ id: 2, name: 'PublicOne', full_name: 'fr4iser90/PublicOne' }),
        repo({ id: 3, name: 'OnlyRemote', full_name: 'fr4iser90/OnlyRemote' }),
      ],
      device,
    )
    expect(matched[0]?.match).toBe('on_device')
    expect(matched[0]?.matchReason).toBe('git_remote')
    expect(matched[0]?.localPath).toBe('/home/u/ALLEREPOS/agent-kernel')
    expect(matched[1]?.match).toBe('on_device')
    expect(matched[1]?.matchReason).toBe('basename')
    expect(matched[2]?.match).toBe('missing')
    expect(matched[2]?.localPath).toBeNull()
  })
})
