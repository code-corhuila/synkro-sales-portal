// Runs async tasks with at most `limit` in flight. After the first failure no further task starts and
// that failure is what the caller receives; tasks already in flight finish on their own.
export async function runPool(tasks: (() => Promise<void>)[], limit: number): Promise<void> {
  let next = 0
  let failed = false
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (!failed && next < tasks.length) {
      try {
        await tasks[next++]()
      } catch (error) {
        failed = true
        throw error
      }
    }
  }))
}
