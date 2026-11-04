// Detail navigation contract: the helper lives with the other host-navigation functions.
export { saleDetailPath } from './navigation'

import { REPORT_KINDS, type ReportKind } from './sales/model/report'

export type SalesRoute = { screen: 'history' } | { screen: 'report'; kind: ReportKind } | { screen: 'detail'; saleId: string }

// The host mounts this app for every /sales/* location and does not share its router with the
// portal, so the portal maps the path itself. Anything else is not Sales' screen.
export function parseRoute(path: string): SalesRoute | null {
  if (/^\/sales\/?$/.test(path)) return { screen: 'history' }
  // Reports come before the detail pattern: a sale id is a UUID, never the word "reports".
  if (/^\/sales\/reports\/?$/.test(path)) return { screen: 'report', kind: 'daily' }
  const report = /^\/sales\/reports\/([^/]+)\/?$/.exec(path)
  if (report) {
    const kind = REPORT_KINDS.find((candidate) => candidate === report[1])
    return kind ? { screen: 'report', kind } : null
  }
  if (path.toLowerCase().startsWith('/sales/reports/')) return null
  const detail = /^\/sales\/([^/]+)\/?$/.exec(path)
  if (!detail) return null
  try {
    return { screen: 'detail', saleId: decodeURIComponent(detail[1]) }
  } catch {
    return null
  }
}
