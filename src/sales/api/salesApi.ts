import { apiClient } from 'shell/apiClient'
import { cleanFilters, validateFilters, type SalesQuery } from '../model/filters'
import type { Page } from '../model/page'
import type { Sale } from '../model/sale'

export async function listSales(filters: SalesQuery = {}, options: { signal?: AbortSignal } = {}): Promise<Page<Sale>> {
  const page = filters.page ?? 1
  const cleaned = cleanFilters(filters)
  if (!Number.isSafeInteger(page) || page < 1 || Object.keys(validateFilters(cleaned)).length) {
    throw new Error('Consulta de ventas inválida')
  }
  // Explicit whitelist: neither ownership nor caller-supplied limits cross the boundary.
  return apiClient.request<Page<Sale>>('/api/v1/sales', {
    query: { page, limit: 20, ...cleaned }, signal: options.signal,
  })
}
