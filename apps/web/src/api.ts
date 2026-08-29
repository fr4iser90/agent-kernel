export type Project = {
  id: string
  ownerId: string
  name: string
  localPath: string
  gitRemote: string | null
  status: 'registered' | 'initialized'
  lawpackVersion: string | null
  createdAt: string
  updatedAt: string
}

const jsonHeaders = { 'Content-Type': 'application/json' }

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch('/api/projects')
  if (!res.ok) throw new Error(`list failed: ${res.status}`)
  const data = (await res.json()) as { projects: Project[] }
  return data.projects
}

export async function registerProject(input: {
  name: string
  localPath: string
  gitRemote?: string
}): Promise<Project> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `register failed: ${res.status}`)
  }
  const data = (await res.json()) as { project: Project }
  return data.project
}
