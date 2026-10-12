import { useCallback, useEffect, useState } from 'react'
import { listSales } from '../api/salesApi'
import { cleanFilters, type SalesFilters } from '../model/filters'
import type { Page } from '../model/page'
import type { Sale } from '../model/sale'

type State = { status: 'loading' } | { status: 'ready'; value: Page<Sale> } | { status: 'error'; error: unknown }

export function useSalesHistory() {
  const [query, setQuery] = useState<{ page: number } & SalesFilters>({ page: 1 })
  const [attempt, setAttempt] = useState(0)
  const [answer, setAnswer] = useState<{ query: typeof query; attempt: number; state: State } | null>(null)
  const state: State = answer?.query === query && answer.attempt === attempt ? answer.state : { status: 'loading' }

  useEffect(() => {
    const controller = new AbortController()
    listSales(query, { signal: controller.signal }).then(
      (value) => {
        if (controller.signal.aborted) return
        // A deletion/reload can shrink the last page. Never ask for page zero.
        const last = Math.max(1, value.meta.totalPages)
        if (query.page > last) {
          setQuery({ ...query, page: last })
          return
        }
        setAnswer({ query, attempt, state: { status: 'ready', value } })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setAnswer({ query, attempt, state: { status: 'error', error } })
      },
    )
    return () => controller.abort()
  }, [query, attempt])

  const applyFilters = useCallback((filters: SalesFilters) => setQuery({ page: 1, ...cleanFilters(filters) }), [])
  const retry = useCallback(() => setAttempt((current) => current + 1), [])
  function goToPage(page: number) {
    if (state.status !== 'ready' || !Number.isSafeInteger(page) || page < 1 || page > state.value.meta.totalPages || page === query.page) return
    setQuery({ ...query, page })
  }
  return { state, query, applyFilters, retry, goToPage }
}
