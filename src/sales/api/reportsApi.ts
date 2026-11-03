import { apiClient } from 'shell/apiClient'
import { cleanFilters, validateFilters } from '../model/filters'
import type { Page } from '../model/page'
import type { ReportKind, ReportRows } from '../model/report'

export const REPORT_ENDPOINTS: Record<ReportKind, string> = {
  daily: '/api/v1/sales/reports/daily',
  monthly: '/api/v1/sales/reports/monthly',
  'top-products': '/api/v1/sales/reports/top-products',
}

export const REPORT_PAGE_SIZE = 20

export interface ReportQuery { page?: number; limit?: number; from?: string; to?: string }

// Only page, limit, from and to are accepted by the API; unknown, repeated or empty
// parameters answer 400. Ownership is derived from the verified token, so nothing about
// the seller crosses this boundary. Dates are inclusive UTC days.
export async function listReport<K extends ReportKind>(
  kind: K,
  query: ReportQuery = {},
  { signal }: { signal?: AbortSignal } = {},
): Promise<Page<ReportRows[K]>> {
  const page = query.page ?? 1
  const limit = query.limit ?? REPORT_PAGE_SIZE
  const dates = cleanFilters({ from: query.from, to: query.to })
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100 || Object.keys(validateFilters(dates)).length) {
    throw new Error('Consulta de reporte inválida')
  }
  return apiClient.request<Page<ReportRows[K]>>(REPORT_ENDPOINTS[kind], { query: { page, limit, ...dates }, signal })
}
