import { SaleDetailPage } from './sales/pages/SaleDetailPage'
import { SalesPage } from './sales/pages/SalesPage'

// Detail navigation contract: the helper lives with the other host-navigation functions.
export { saleDetailPath } from './navigation'

// The host router mounts this app for every /sales/* location and does not share its router
// with the portal, so the portal maps the path itself, reading the browser's location.
export function resolveScreen(path: string) {
  if (/^\/sales\/?$/.test(path)) return <SalesPage />
  const detail = /^\/sales\/([^/]+)\/?$/.exec(path)
  if (!detail) return null
  try {
    const saleId = decodeURIComponent(detail[1])
    return <SaleDetailPage key={saleId} saleId={saleId} />
  } catch {
    return null
  }
}
