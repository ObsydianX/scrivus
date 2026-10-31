// Preserve input order while limiting filesystem requests in flight.
export async function mapConcurrent<T, R>(items: readonly T[], mapper: (item: T) => Promise<R>, concurrency = 8): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = await Promise.allSettled(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await mapper(items[index])
    }
  }))
  // Drain remaining workers before reporting failure to callers (especially
  // backup/restore callers that must not leave background copies running).
  for (const worker of workers) {
    if (worker.status === 'rejected') throw worker.reason
  }
  return results
}
