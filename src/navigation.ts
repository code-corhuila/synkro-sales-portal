// The portal does not share the host's router: the host mounts this app and reads the
// browser's location. To go to another screen without a document load, the portal updates
// the URL with the History API and announces it with a popstate event, which is what the
// host's history-based router listens to (same contract as the Products portal).

export const SALES_PATH = '/sales'

export const saleDetailPath = (saleId: string) => `${SALES_PATH}/${encodeURIComponent(saleId)}`

export function navigateTo(path: string): void {
  const current = window.location.pathname + window.location.search + window.location.hash
  if (path === current) return
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

// A one-shot message for the history screen, carried in the history entry itself:
// never in the URL, never in storage, and gone after it is read.
export type SalesNotice = 'forbidden'
const NOTICE_KEY = 'synkroSalesNotice'

// Replaces the current entry, so Back does not return to the screen the person may not see.
export function redirectToSales(notice: SalesNotice): void {
  const current = (window.history.state ?? {}) as Record<string, unknown>
  window.history.replaceState({ ...current, [NOTICE_KEY]: notice }, '', SALES_PATH)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function peekSalesNotice(): SalesNotice | null {
  const state = window.history.state as Record<string, unknown> | null
  return state?.[NOTICE_KEY] === 'forbidden' ? 'forbidden' : null
}

export function clearSalesNotice(): void {
  const state = window.history.state as Record<string, unknown> | null
  if (!state || !(NOTICE_KEY in state)) return
  const rest = { ...state }
  delete rest[NOTICE_KEY]
  window.history.replaceState(Object.keys(rest).length ? rest : null, '')
}

export function takeSalesNotice(): SalesNotice | null {
  const notice = peekSalesNotice()
  clearSalesNotice()
  return notice
}
