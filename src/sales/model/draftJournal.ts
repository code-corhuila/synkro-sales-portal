import { session } from 'shell/session'
import { isUuid } from './identifier'
import { recoveryOwner } from './intentJournal'

// The sale in progress, kept in this tab's sessionStorage so it survives navigating to another
// screen (for example to create a customer) and a reload. It is a convenience, never an
// authority: only identifiers and quantities are kept, so a restored sale is always rebuilt
// from the services (names, prices, stock and the customer's availability come back fresh).
// Never credentials, names, documents, contacts or prices. It belongs to one person and one
// session: another person, or the same one after signing out, never receives it.
export interface DraftRecord {
  customerId: string | null
  lines: { productId: string; quantity: number }[]
}

const STORAGE_KEY = 'synkro.sales.draft.v1'
const MAX_DRAFT_LINES = 100

export const draftOwner = recoveryOwner

const isQuantity = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1

function parse(value: unknown): DraftRecord | null {
  if (!value || typeof value !== 'object') return null
  const { customerId, lines } = value as Record<string, unknown>
  if (customerId !== null && (typeof customerId !== 'string' || !isUuid(customerId))) return null
  if (!Array.isArray(lines) || lines.length > MAX_DRAFT_LINES) return null
  const seen = new Set<string>()
  const clean: DraftRecord['lines'] = []
  for (const line of lines) {
    if (!line || typeof line !== 'object') return null
    const keys = Object.keys(line).sort().join()
    const { productId, quantity } = line as Record<string, unknown>
    if (keys !== 'productId,quantity' || typeof productId !== 'string' || !isUuid(productId) || !isQuantity(quantity) || seen.has(productId)) return null
    seen.add(productId)
    clean.push({ productId, quantity })
  }
  return { customerId: customerId as string | null, lines: clean }
}

export function readDraft(owner: string | null): DraftRecord | null {
  if (!owner) return null
  try {
    // eslint-disable-next-line no-restricted-globals -- Only this noncredential sale-in-progress record is read here.
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const record = JSON.parse(raw) as { owner?: unknown; draft?: unknown }
    if (record.owner !== owner) { removeDraft(); return null }
    const draft = parse(record.draft)
    if (!draft) { removeDraft(); return null }
    watchOwner(owner)
    return draft
  } catch {
    removeDraft()
    return null
  }
}

let unsubscribe: (() => void) | undefined
export function removeDraft() {
  try {
    // eslint-disable-next-line no-restricted-globals -- Removes only this portal's sale-in-progress record.
    sessionStorage.removeItem(STORAGE_KEY)
  } catch { /* storage unavailable: nothing was kept */ }
  unsubscribe?.()
  unsubscribe = undefined
}

// An empty draft is not kept. A storage failure is silent on purpose: the sale still works in
// memory; only the recovery after leaving the screen is lost.
export function writeDraft(owner: string | null, draft: DraftRecord) {
  if (!owner || draftOwner() !== owner) return
  if (!draft.customerId && !draft.lines.length) { removeDraft(); return }
  try {
    // eslint-disable-next-line no-restricted-globals -- Only identifiers and quantities are persisted.
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ owner, draft: { customerId: draft.customerId, lines: draft.lines.map(({ productId, quantity }) => ({ productId, quantity })) } }))
    watchOwner(owner)
  } catch { /* quota or blocked storage */ }
}

function watchOwner(owner: string) {
  // Stays subscribed while the remote is unmounted by navigation: signing out clears the record.
  if (!unsubscribe) unsubscribe = session.subscribe?.(() => {
    if (draftOwner() !== owner) removeDraft()
  })
}
