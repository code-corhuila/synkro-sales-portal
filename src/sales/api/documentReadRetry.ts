// Large sale documents can meet the Gateway's shared read budget. Retry only429 GET work;
// other failures retain their original semantics and the Host still owns transport/session.
const MAX_ATTEMPTS = 3
const MAX_WAIT_MS = 10_000
interface ThrottledRead { status?: number; retryAt?: number }
const cancelled = () => new DOMException('The operation was aborted.', 'AbortError')

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(cancelled()); return }
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    const onAbort = () => {
      clearTimeout(timer)
      cleanup()
      reject(cancelled())
    }
    const timer = setTimeout(() => { cleanup(); resolve() }, milliseconds)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function readDocumentSource<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  let waited = 0
  for (let attempt = 0; ; attempt += 1) {
    if (signal?.aborted) throw cancelled()
    try { return await work() }
    catch (error) {
      const throttled = error as ThrottledRead | null
      if (throttled?.status !== 429 || attempt + 1 >= MAX_ATTEMPTS) throw error
      const retryAt = throttled.retryAt
      const delay = typeof retryAt === 'number' && Number.isFinite(retryAt)
        ? Math.max(0, retryAt - Date.now()) : (attempt + 1) * 1000
      // Never truncate Retry-After and retry earlier than the server requested.
      if (delay > MAX_WAIT_MS - waited) throw error
      await wait(delay, signal)
      waited += delay
    }
  }
}
