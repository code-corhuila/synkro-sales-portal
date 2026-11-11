import { useEffect, useRef, useState } from 'react'
import { getCustomer } from '../api/customersApi'
import { getProduct } from '../api/productsApi'
import { runPool } from '../api/pool'
import type { CustomerChoice } from '../model/customer'
import type { Product } from '../model/product'
import type { RegisterSaleRequest } from '../model/saleForm'
import styles from './SaleForm.module.css'

interface Props {
  request: RegisterSaleRequest
  // What the screen already knows; anything missing is read from the services, best effort.
  knownCustomer?: CustomerChoice | null
  knownProducts?: Product[]
}

// A sale that was sent (or may have been) is shown exactly as it was sent and cannot be edited:
// changing it would be a different sale and needs a different idempotency key. Names are only a
// courtesy; when a service cannot answer, the identifiers still identify what was sent.
export function SentAttempt({ request, knownCustomer = null, knownProducts = [] }: Props) {
  const [customer, setCustomer] = useState<CustomerChoice | null>(knownCustomer?.customerId === request.customerId ? knownCustomer : null)
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(knownProducts.map((product) => [product.productId, product.name])))
  // What is already on screen, so the lookups below only fill in what is missing.
  const have = useRef({ customer: customer !== null, products: new Set(Object.keys(names)) })

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const tasks: (() => Promise<void>)[] = []
    if (!have.current.customer) {
      tasks.push(async () => {
        try {
          const found = await getCustomer(request.customerId, { signal })
          if (signal.aborted) return
          have.current.customer = true
          setCustomer({ customerId: found.customerId, name: found.name, identityDocument: found.identityDocument })
        } catch { /* the identifier is shown instead */ }
      })
    }
    for (const { productId } of request.lines) {
      if (have.current.products.has(productId)) continue
      tasks.push(async () => {
        try {
          const found = await getProduct(productId, { signal })
          if (signal.aborted) return
          have.current.products.add(productId)
          setNames((current) => ({ ...current, [productId]: found.name }))
        } catch { /* the identifier is shown instead */ }
      })
    }
    void runPool(tasks, 4).catch(() => undefined)
    return () => controller.abort()
  }, [request])

  return <section aria-label="Intento de venta enviado" className={styles.picker}>
    <p className={styles.note}>
      Esta venta ya fue enviada y no se puede editar. Si no se confirmó, reintenta el envío: se usará la misma clave y no se creará otra venta.
    </p>
    <div className={styles.result}>
      <div className={styles.resultText}>
        {customer
          ? <><span className={styles.name}>{customer.name}</span><span className={styles.mono}>Documento {customer.identityDocument}</span></>
          : <span className={styles.name}>Cliente …{request.customerId.slice(-6)}</span>}
      </div>
    </div>
    <ul className={styles.lines} aria-label="Productos enviados">
      {request.lines.map((line) => <li key={line.productId} className={styles.result}>
        <span className={styles.name}>{names[line.productId] ?? `Producto …${line.productId.slice(-6)}`} × {line.quantity}</span>
      </li>)}
    </ul>
  </section>
}
