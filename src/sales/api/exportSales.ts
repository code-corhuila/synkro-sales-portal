import type { SalesFilters } from '../model/filters'
import type { Sale } from '../model/sale'
import { listSales } from './salesApi'

const MAX_ROWS = 1_000
const MAX_PAGES = 50

export async function listAllMatchingSales(filters: SalesFilters, signal: AbortSignal): Promise<Sale[]> {
  const first = await listSales({ ...filters, page: 1 }, { signal })
  const { total, totalPages } = first.meta
  if (total > MAX_ROWS || totalPages > MAX_PAGES) throw new Error('Aplica más filtros para exportar hasta 1.000 ventas.')
  const items = [...first.data]
  for (let page = 2; page <= totalPages; page += 1) {
    const next = await listSales({ ...filters, page }, { signal })
    if (next.meta.page !== page || next.meta.total !== total || next.meta.totalPages !== totalPages) {
      throw new Error('Las ventas cambiaron durante la descarga. Inténtalo de nuevo.')
    }
    items.push(...next.data)
  }
  if (items.length !== total || new Set(items.map((sale) => sale.saleId)).size !== total) {
    throw new Error('Las ventas cambiaron durante la descarga. Inténtalo de nuevo.')
  }
  return items
}
