import type { OwnerId } from '../identity/owner.js'

export type ProjectId = string

export type ProjectStatus = 'registered' | 'initialized'

export interface Project {
  id: ProjectId
  ownerId: OwnerId
  name: string
  localPath: string
  gitRemote: string | null
  status: ProjectStatus
  lawpackVersion: string | null
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface RegisterProjectInput {
  name: string
  /** Opaque executor workdir path (not inspected by the kernel). */
  localPath: string
  gitRemote?: string | null
}
