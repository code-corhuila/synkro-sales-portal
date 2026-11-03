import { useCallback, useEffect, useState } from 'react'
import { listReport } from '../api/reportsApi'
import { getProduct } from '../api/productsApi'
import { cleanFilters, type SalesFilters } from '../model/filters'
import type { Page } from '../model/page'
import type { ReportKind, ReportRows } from '../model/report'

type State<K extends ReportKind> = { status: 'loading' } | { status: 'ready'; value: Page<ReportRows[K]> } | { status: 'error'; error: unknown }
type Query = { page: number; from?: string; to?: string }
interface Options { enabled?: boolean; limit?: number }

// One report at a time. Every change of report, filter, page or retry aborts the previous
// request, and an answer is kept together with the query it belongs to, so a late response
// (even from a client that ignores the abort) can never replace the current filter's state.
export function useReport<K extends ReportKind>(kind: K, { enabled = true, limit }: Options = {}) {
  const [query, setQuery] = useState<Query>({ page: 1 })
  const [attempt, setAttempt] = useState(0)
  const [answer, setAnswer] = useState<{ kind: K; query: Query; attempt: number; state: State<K> } | null>(null)
  const state: State<K> = answer?.kind === kind && answer.query === query && answer.attempt === attempt ? answer.state : { status: 'loading' }

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    listReport(kind, { ...query, limit }, { signal: controller.signal }).then(
      (value) => {
        if (controller.signal.aborted) return
        // The data can shrink under the last page. Never ask for page zero.
        const last = Math.max(1, value.meta.totalPages)
        if (query.page > last) {
          setQuery({ ...query, page: last })
          return
        }
        setAnswer({ kind, query, attempt, state: { status: 'ready', value } })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setAnswer({ kind, query, attempt, state: { status: 'error', error } })
      },
    )
    return () => controller.abort()
  }, [kind, query, attempt, enabled, limit])

  const applyFilters = useCallback((filters: SalesFilters) => {
    const { from, to } = cleanFilters(filters)
    setQuery({ page: 1, from, to })
  }, [])
  const retry = useCallback(() => setAttempt((current) => current + 1), [])
  function goToPage(page: number) {
    if (state.status !== 'ready' || !Number.isSafeInteger(page) || page < 1 || page > state.value.meta.totalPages || page === query.page) return
    setQuery({ ...query, page })
  }
  return { state, query, applyFilters, retry, goToPage }
}

// Product names are optional enrichment of the top-products rows: the report never waits for
// them, a failure keeps the stored identifier, and nothing is invented. `null` = unavailable.
export function useProductNames(productIds: string[]): Record<string, string | null> {
  const key = productIds.join(',')
  const [names, setNames] = useState<{ key: string; value: Record<string, string | null> }>({ key: '', value: {} })

  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    const remember = (id: string, name: string | null) => {
      if (controller.signal.aborted) return
      setNames((current) => ({ key, value: { ...(current.key === key ? current.value : {}), [id]: name } }))
    }
    for (const id of key.split(',')) {
      getProduct(id, { signal: controller.signal }).then((product) => remember(id, product.name), () => remember(id, null))
    }
    return () => controller.abort()
  }, [key])

  return names.key === key ? names.value : {}
}
