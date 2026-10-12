import { SalesPage } from './sales/pages/SalesPage'

// Detail navigation contract: the helper lives with the other host-navigation functions.
export { saleDetailPath } from './navigation'

export function resolveScreen(path: string) {
  return /^\/sales\/?$/.test(path) ? <SalesPage /> : null
}
