/** Shared loud failure for unfinished ExecutorPort adapters. */
export function executorNotImplemented(executorId: string, method: string): never {
  throw new Error(
    `executorId=${executorId}: ${method} not implemented — adapter placeholder only`,
  )
}
