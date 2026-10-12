import { vi } from 'vitest'
import type { RequestOptions } from 'shell/apiClient'

export const apiClient = {
  request: vi.fn<(path: string, options?: RequestOptions) => Promise<unknown>>(),
}
