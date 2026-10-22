import { SalesPage } from './sales/pages/SalesPage'

// Future detail navigation contract. No browser router or fake detail screen.
export const saleDetailPath = (saleId: string) => `/sales/${encodeURIComponent(saleId)}`
export function resolveScreen(path: string) {
  return /^\/sales\/?$/.test(path) ? <SalesPage /> : null
}
