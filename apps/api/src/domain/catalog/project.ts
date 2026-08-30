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
  /** Absolute path on the control-plane host (OpenAPI: path). */
  localPath: string
  gitRemote?: string | null
}
