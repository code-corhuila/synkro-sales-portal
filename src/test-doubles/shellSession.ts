import { vi } from 'vitest'
import type { ShellUser } from 'shell/session'

const listeners = new Set<() => void>()
export const session = {
  user: vi.fn<() => ShellUser | null>(() => null),
  sessionId: vi.fn<() => string | null>(() => 'test-session'),
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
}
export const notifySession = () => listeners.forEach((listener) => listener())
