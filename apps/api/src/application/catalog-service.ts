import { randomUUID } from 'node:crypto'
import type { Project, RegisterProjectInput } from '../domain/catalog/project.js'
import type { ProjectRepository } from '../domain/catalog/project-repository.js'
import { LOCAL_OWNER_ID } from '../domain/identity/owner.js'

export class CatalogService {
  constructor(private readonly projects: ProjectRepository) {}

  listProjects(): Project[] {
    return this.projects.listByOwner(LOCAL_OWNER_ID)
  }

  registerProject(input: RegisterProjectInput): Project {
    const name = input.name.trim()
    const localPath = input.localPath.trim()
    if (!name) throw new Error('name is required')
    if (!localPath) throw new Error('localPath is required')
    const now = new Date().toISOString()
    return this.projects.create({
      id: randomUUID(),
      ownerId: LOCAL_OWNER_ID,
      name,
      localPath,
      gitRemote: input.gitRemote?.trim() || null,
      now,
    })
  }
}
