// Detail navigation contract: the helper lives with the other host-navigation functions.
export { saleDetailPath } from './navigation'

export type SalesRoute = { screen: 'history' } | { screen: 'detail'; saleId: string }

// The host mounts this app for every /sales/* location and does not share its router with the
// portal, so the portal maps the path itself. Anything else is not Sales' screen.
export function parseRoute(path: string): SalesRoute | null {
  if (/^\/sales\/?$/.test(path)) return { screen: 'history' }
  const detail = /^\/sales\/([^/]+)\/?$/.exec(path)
  if (!detail) return null
  try {
    return { screen: 'detail', saleId: decodeURIComponent(detail[1]) }
  } catch {
    return null
  }
}
