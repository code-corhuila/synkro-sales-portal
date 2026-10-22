import { useCallback, useEffect, useRef, useState } from 'react'
import { getCustomer } from '../api/customersApi'
import { getProduct } from '../api/productsApi'
import { getSale } from '../api/salesApi'
import type { Customer } from '../model/customer'
import { isUuid } from '../model/identifier'
import type { Product } from '../model/product'
import type { Sale } from '../model/sale'

// The Sales record is authoritative and independent: customer and product names are
// resolved afterwards, one distinct id at a time, through their own APIs. There is no
// batch endpoint in the contracts, so the fan-out is bounded instead.
export const MAX_METADATA_CONCURRENCY = 4

export type Meta<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'unavailable' }
export type SaleState =
  | { status: 'loading' }
  | { status: 'ready'; value: Sale }
  | { status: 'notFound' }
  | { status: 'forbidden' }
  | { status: 'error'; error: unknown }

interface Metadata { sale: Sale; customer: Meta<Customer>; products: Record<string, Meta<Product>> }
const LOADING: Meta<never> = { status: 'loading' }

async function runPool(tasks: (() => Promise<void>)[], limit: number) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) await tasks[next++]()
  }))
}

export function useSaleDetail(saleId: string) {
  const valid = isUuid(saleId)
  const [attempt, setAttempt] = useState(0)
  const [answer, setAnswer] = useState<{ saleId: string; attempt: number; state: SaleState } | null>(null)
  const [metadata, setMetadata] = useState<Metadata | null>(null)
  const latest = useRef<Metadata | null>(null)

  useEffect(() => {
    if (!valid) return
    const controller = new AbortController()
    getSale(saleId, { signal: controller.signal }).then(
      (value) => { if (!controller.signal.aborted) setAnswer({ saleId, attempt, state: { status: 'ready', value } }) },
      (error: unknown) => {
        if (controller.signal.aborted) return
        const status = (error as { status?: number } | null)?.status
        const state: SaleState = status === 404 ? { status: 'notFound' } : status === 403 ? { status: 'forbidden' } : { status: 'error', error }
        setAnswer({ saleId, attempt, state })
      },
    )
    return () => controller.abort()
  }, [saleId, attempt, valid])

  const sale: SaleState = !valid ? { status: 'notFound' } : answer?.saleId === saleId && answer.attempt === attempt ? answer.state : { status: 'loading' }
  const loaded = sale.status === 'ready' ? sale.value : null

  const [metadataAttempt, setMetadataAttempt] = useState(0)
  useEffect(() => {
    if (!loaded) return
    const controller = new AbortController()
    const { signal } = controller
    const previous = latest.current?.sale === loaded ? latest.current : null
    let current: Metadata = previous ?? { sale: loaded, customer: LOADING, products: {} }
    latest.current = current
    const publish = (patch: Partial<Metadata>) => {
      if (signal.aborted) return
      current = { ...current, ...patch }
      latest.current = current
      setMetadata(current)
    }
    const distinct = [...new Set(loaded.details.map((line) => line.productId))]
    const tasks: (() => Promise<void>)[] = []
    // First pass: everything. A retry (see retryMetadata) leaves only the unavailable entries loading.
    if (current.customer.status === 'loading') {
      tasks.push(async () => {
        try { publish({ customer: { status: 'ready', value: await getCustomer(loaded.customerId, { signal }) } }) }
        catch { publish({ customer: { status: 'unavailable' } }) }
      })
    }
    for (const productId of distinct) {
      if (current.products[productId] && current.products[productId].status !== 'loading') continue
      tasks.push(async () => {
        try {
          const value = await getProduct(productId, { signal })
          publish({ products: { ...current.products, [productId]: { status: 'ready', value } } })
        } catch {
          publish({ products: { ...current.products, [productId]: { status: 'unavailable' } } })
        }
      })
    }
    void runPool(tasks, MAX_METADATA_CONCURRENCY)
    return () => controller.abort()
  }, [loaded, metadataAttempt])

  const view = metadata && metadata.sale === loaded ? metadata : null
  const customer: Meta<Customer> = view?.customer ?? LOADING
  const products: Record<string, Meta<Product>> = Object.fromEntries(
    [...new Set((loaded?.details ?? []).map((line) => line.productId))].map((id) => [id, view?.products[id] ?? LOADING]),
  )
  const metadataFailed = customer.status === 'unavailable' || Object.values(products).some((entry) => entry.status === 'unavailable')

  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  // Only what failed is asked again; what resolved (and the sale itself) is kept.
  const retryMetadata = useCallback(() => {
    const current = latest.current
    if (!current) return
    const reset: Metadata = {
      ...current,
      customer: current.customer.status === 'unavailable' ? LOADING : current.customer,
      products: Object.fromEntries(Object.entries(current.products).map(([id, entry]) => [id, entry.status === 'unavailable' ? LOADING : entry])),
    }
    latest.current = reset
    setMetadata(reset)
    setMetadataAttempt((value) => value + 1)
  }, [])

  return { sale, customer, products, metadataFailed, retry, retryMetadata }
}
