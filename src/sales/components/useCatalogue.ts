import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { CATALOGUE_BATCH, listCatalogue } from '../api/productsApi'
import type { Product } from '../model/product'

export { CATALOGUE_BATCH }
export const SEARCH_DEBOUNCE_MS = 200

export type CatalogueState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; error: unknown }

interface Model { products: Product[]; total: number; page: number; totalPages: number; state: CatalogueState; loadingMore: boolean }
type Action =
  | { type: 'reset' }
  | { type: 'loaded'; page: number; products: Product[]; total: number; totalPages: number }
  | { type: 'failed'; error: unknown; more: boolean }
  | { type: 'more' }

const initial: Model = { products: [], total: 0, page: 0, totalPages: 0, state: { status: 'loading' }, loadingMore: false }

function reduce(model: Model, action: Action): Model {
  switch (action.type) {
    case 'reset': return initial
    case 'more': return { ...model, loadingMore: true }
    case 'loaded': {
      const seen = new Set(model.products.map((item) => item.productId))
      const added = action.products.filter((item) => !seen.has(item.productId))
      return { products: [...model.products, ...added], total: action.total, page: action.page, totalPages: action.totalPages, state: { status: 'ready' }, loadingMore: false }
    }
    case 'failed': return action.more ? { ...model, loadingMore: false, state: { status: 'error', error: action.error } } : { ...initial, state: { status: 'error', error: action.error } }
  }
}

// The catalogue the sale clicks on: a debounced name filter and a category, both answered by the
// Products service in bounded batches. Each new query aborts the one in flight and an answer that was
// superseded is never applied.
export function useCatalogue() {
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [term, setTerm] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [model, dispatch] = useReducer(reduce, initial)
  const controller = useRef<AbortController | null>(null)
  const modelRef = useRef(model)
  useEffect(() => { modelRef.current = model })

  // The first query is immediate; later keystrokes settle for 200 ms.
  useEffect(() => {
    const trimmed = name.trim()
    if (trimmed === term) return
    const timer = setTimeout(() => setTerm(trimmed), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [name, term])

  const fetchPage = useCallback((page: number, more: boolean) => {
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    if (more) dispatch({ type: 'more' })
    listCatalogue({ name: term, categoryId, page }, { signal: current.signal }).then(
      (result) => { if (!current.signal.aborted) dispatch({ type: 'loaded', page, products: result.data, total: result.meta.total, totalPages: result.meta.totalPages }) },
      (error: unknown) => { if (!current.signal.aborted) dispatch({ type: 'failed', error, more }) },
    )
  }, [term, categoryId])

  useEffect(() => {
    dispatch({ type: 'reset' })
    fetchPage(1, false)
    return () => controller.current?.abort()
  }, [fetchPage, attempt])

  const loadMore = useCallback(() => {
    const { page, totalPages, loadingMore } = modelRef.current
    if (loadingMore || page >= totalPages) return
    fetchPage(page + 1, true)
  }, [fetchPage])
  const retry = useCallback(() => {
    if (modelRef.current.products.length > 0) fetchPage(modelRef.current.page + 1, true)
    else setAttempt((value) => value + 1)
  }, [fetchPage])

  return {
    name, setName, categoryId, setCategoryId,
    state: model.state, products: model.products, total: model.total, loadingMore: model.loadingMore,
    hasMore: model.page < model.totalPages, loadMore, retry,
  }
}
