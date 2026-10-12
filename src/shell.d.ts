// Modules the host (synkro-front) exposes through Module Federation. They are
// resolved by the federation plugin at build time, not by TypeScript, and the
// portal never defines its own: the host owns the single HTTP client and the
// session (it adds the gateway address, credential, correlation id and timeout).
declare module 'shell/apiClient' {
  // Fixed by the host contract. `query` is appended to the path (undefined and
  // null are skipped). Aborting `signal` makes the host reject; the portal does
  // not depend on that rejection's shape, because it ignores superseded requests.
  export interface RequestOptions {
    method?: string
    body?: unknown
    headers?: Record<string, string>
    query?: Record<string, string | number | boolean | null | undefined>
    idempotencyKey?: string
    signal?: AbortSignal
  }

  export const apiClient: {
    request<T>(path: string, options?: RequestOptions): Promise<T>
  }
}

declare module 'shell/session' {
  export interface ShellUser {
    sub: string
    role: string
  }

  export const session: {
    user(): ShellUser | null
  }
}
