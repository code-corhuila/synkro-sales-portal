import { useEffect, useRef, useState } from 'react'
import { getCustomer } from '../api/customersApi'
import { runPool } from '../api/pool'

// The history shows who bought, not a UUID. Customers has no batch endpoint, so each distinct id is
// read once, with a bounded fan-out, and a customer that cannot be read stays "unavailable": a name or
// document is never invented, and one failure does not hide the others. These are the customer's
// CURRENT name and document (Customers is the source), not a copy taken when the sale was made.
export const CUSTOMER_LOOKUP_CONCURRENCY = 4

export type CustomerLabel =
  | { status: 'loading' }
  | { status: 'ready'; name: string; document: string }
  | { status: 'unavailable' }

const LOADING: CustomerLabel = { status: 'loading' }

export function useCustomerLabels(customerIds: readonly string[]): ReadonlyMap<string, CustomerLabel> {
  const [labels, setLabels] = useState<ReadonlyMap<string, CustomerLabel>>(new Map())
  // Ids already requested (or answered) by this mounted hook: a later list never repeats them.
  const requested = useRef(new Set<string>())
  const controller = useRef<AbortController | null>(null)
  const key = [...new Set(customerIds)].sort().join('|')

  useEffect(() => {
    const wanted = key ? key.split('|') : []
    const fresh = wanted.filter((id) => !requested.current.has(id))
    if (!fresh.length) return
    controller.current ??= new AbortController()
    const { signal } = controller.current
    fresh.forEach((id) => requested.current.add(id))
    const publish = (id: string, label: CustomerLabel) => {
      if (signal.aborted) return
      setLabels((current) => new Map(current).set(id, label))
    }
    runPool(fresh.map((id) => async () => {
      try {
        const customer = await getCustomer(id, { signal })
        publish(id, { status: 'ready', name: customer.name, document: customer.identityDocument })
      } catch {
        // Aborted lookups are not failures to show; a real failure only marks this customer.
        if (!signal.aborted) publish(id, { status: 'unavailable' })
      }
    }), CUSTOMER_LOOKUP_CONCURRENCY).catch(() => undefined)
  }, [key])

  // A remount (React strict mode, navigation) must be able to ask again.
  useEffect(() => () => { controller.current?.abort(); controller.current = null; requested.current.clear() }, [])

  const view = new Map<string, CustomerLabel>()
  for (const id of key ? key.split('|') : []) view.set(id, labels.get(id) ?? LOADING)
  return view
}
