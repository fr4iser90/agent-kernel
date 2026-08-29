/** Implicit single operator — ADR-0003 */
export const LOCAL_OWNER_ID = 'local-owner' as const

export type OwnerId = typeof LOCAL_OWNER_ID | string
