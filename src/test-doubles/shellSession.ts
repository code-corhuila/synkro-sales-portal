import { vi } from 'vitest'
import type { ShellUser } from 'shell/session'

export const session = { user: vi.fn<() => ShellUser | null>(() => null) }
