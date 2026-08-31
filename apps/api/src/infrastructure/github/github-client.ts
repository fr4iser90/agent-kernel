export type GhRepo = {
  id: number
  name: string
  full_name: string
  private: boolean
  html_url: string
  clone_url: string
  ssh_url: string
  default_branch: string
  description: string | null
  pushed_at: string | null
  language: string | null
}

export type GhUser = {
  id: number
  login: string
  name: string | null
  avatar_url: string
}

export class GitHubClient {
  constructor(private readonly token: string) {
    if (!token?.trim()) throw new Error('GitHub token required')
  }

  private static async githubFetch(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init)
    } catch (e) {
      const cause = e instanceof Error ? e.message : String(e)
      throw new Error(
        `GitHub unreachable from this host (${cause}). API container must allow outbound HTTPS to github.com / api.github.com`,
      )
    }
  }

  private async api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await GitHubClient.githubFetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'User-Agent': 'agent-kernel',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.headers ?? {}),
      },
    })
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status} ${path}: ${await res.text()}`)
    }
    return (await res.json()) as T
  }

  me(): Promise<GhUser> {
    return this.api<GhUser>('/user')
  }

  /** List repos for authenticated user (includes private when token allows). */
  async listUserRepos(opts: {
    visibility: 'all' | 'public' | 'private'
    affiliation?: string
  }): Promise<GhRepo[]> {
    const out: GhRepo[] = []
    let page = 1
    for (;;) {
      const q = new URLSearchParams({
        per_page: '100',
        page: String(page),
        visibility: opts.visibility,
        affiliation: opts.affiliation ?? 'owner',
        sort: 'updated',
      })
      const batch = await this.api<GhRepo[]>(`/user/repos?${q}`)
      out.push(...batch)
      if (batch.length < 100) break
      page++
      if (page > 30) break
    }
    return out
  }

  /** Public repos for a user (no auth needed for public, but we still send token). */
  async listPublicRepos(login: string): Promise<GhRepo[]> {
    const out: GhRepo[] = []
    let page = 1
    for (;;) {
      const q = new URLSearchParams({ per_page: '100', page: String(page), type: 'public' })
      const batch = await this.api<GhRepo[]>(`/users/${encodeURIComponent(login)}/repos?${q}`)
      out.push(...batch)
      if (batch.length < 100) break
      page++
      if (page > 30) break
    }
    return out
  }

  static async exchangeOAuthCode(input: {
    clientId: string
    clientSecret: string
    code: string
    redirectUri: string
  }): Promise<{ access_token: string; token_type: string; scope: string }> {
    const res = await GitHubClient.githubFetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'agent-kernel',
      },
      body: JSON.stringify({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        code: input.code,
        redirect_uri: input.redirectUri,
      }),
    })
    if (!res.ok) {
      throw new Error(`GitHub OAuth token HTTP ${res.status}: ${await res.text()}`)
    }
    const json = (await res.json()) as {
      access_token?: string
      error?: string
      error_description?: string
      token_type?: string
      scope?: string
    }
    if (!json.access_token) {
      throw new Error(`GitHub OAuth failed: ${json.error}: ${json.error_description}`)
    }
    return {
      access_token: json.access_token,
      token_type: json.token_type ?? 'bearer',
      scope: json.scope ?? '',
    }
  }

  static oauthAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'read:user repo',
      state,
    })
    return `https://github.com/login/oauth/authorize?${q}`
  }
}
