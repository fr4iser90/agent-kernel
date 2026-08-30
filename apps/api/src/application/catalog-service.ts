import { randomUUID } from 'node:crypto'
import type { Project, RegisterProjectInput } from '../domain/catalog/project.js'
import type { ProjectRepository } from '../domain/catalog/project-repository.js'

export class CatalogService {
  constructor(private readonly projects: ProjectRepository) {}

  listProjects(ownerId: string): Project[] {
    return this.projects.listByOwner(ownerId)
  }

  registerProject(ownerId: string, input: RegisterProjectInput): Project {
    const name = input.name.trim()
    const localPath = input.localPath.trim()
    if (!name) throw new Error('name is required')
    if (!localPath) throw new Error('localPath is required')
    const now = new Date().toISOString()
    return this.projects.create({
      id: randomUUID(),
      ownerId,
      name,
      localPath,
      gitRemote: input.gitRemote?.trim() || null,
      now,
    })
  }
}
