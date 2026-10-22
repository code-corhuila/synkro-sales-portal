import { session } from 'shell/session'

export interface Intent { fingerprint: string; key: string; sagaId?: string; expiresAt: number }
export const INTENT_TTL_MS = 24 * 3600_000
const STORAGE_KEY = 'synkro.sales.intent.v1'
export const recoveryOwner = () => {
  const user = session.user()
  const id = session.sessionId?.()
  return user && id && session.subscribe && ['ADMIN', 'SALESPERSON'].includes(user.role)
    ? JSON.stringify([user.sub, id]) : null
}

// One tab, one unresolved operation. Never credentials, customer documents,
// names or prices. The fingerprint contains only the canonical external UUIDs
// and quantities necessary to match an explicit retry.
export function readIntent(owner: string | null): Intent | null {
  // eslint-disable-next-line no-restricted-globals -- Only this noncredential recovery record is accessible here.
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  const record = JSON.parse(raw) as { owner: string; intent: Intent }
  if (!owner || record.owner !== owner) { removeIntent(); return null }
  const value = record.intent
  if (!value || typeof value.fingerprint !== 'string' || typeof value.key !== 'string'
    || !Number.isFinite(value.expiresAt) || (value.sagaId !== undefined && typeof value.sagaId !== 'string')) {
    throw new Error('Invalid intent journal')
  }
  watchOwner(owner)
  return value
}

let unsubscribe: (() => void) | undefined
export function removeIntent() {
  // eslint-disable-next-line no-restricted-globals -- Removes only this portal's recovery record.
  sessionStorage.removeItem(STORAGE_KEY)
  unsubscribe?.()
  unsubscribe = undefined
}

export function writeIntent(owner: string, intent: Intent) {
  if (recoveryOwner() !== owner) throw new Error('Session changed')
  // eslint-disable-next-line no-restricted-globals -- No credential, document, name or price is persisted.
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ owner, intent }))
  watchOwner(owner)
}

function watchOwner(owner: string) {
  // Remains subscribed when the remote unmounts during navigation. Logout clears
  // local recovery only; it does not send cancellation/compensation to Workflow.
  if (!unsubscribe) unsubscribe = session.subscribe?.(() => {
    if (recoveryOwner() !== owner) removeIntent()
  })
}
