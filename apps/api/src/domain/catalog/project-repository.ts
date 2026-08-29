import type { Project, ProjectId, RegisterProjectInput } from '../../domain/catalog/project.js'

export interface ProjectRepository {
  listByOwner(ownerId: string): Project[]
  getById(id: ProjectId): Project | null
  create(input: RegisterProjectInput & { ownerId: string; id: string; now: string }): Project
}
