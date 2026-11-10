import { runPool } from '../api/pool'
import type { Customer, CustomerChoice } from './customer'
import type { DraftRecord } from './draftJournal'
import type { Product } from './product'
import { newLine, type LineDraft } from './saleForm'

export interface DraftLoaders {
  loadCustomer: (customerId: string, signal?: AbortSignal) => Promise<Customer>
  loadProduct: (productId: string, signal?: AbortSignal) => Promise<Product>
}

export interface RestoredDraft {
  customer: CustomerChoice | null
  lines: LineDraft[]
  // What changed while the sale was away, in the order a person should read it.
  notices: string[]
}

export const RESTORE_CONCURRENCY = 4
export const CUSTOMER_UNAVAILABLE_NOTICE = 'El cliente de la venta ya no está disponible. Elige otro cliente.'

const isNotFound = (error: unknown) => (error as { status?: number } | null)?.status === 404
const units = (count: number) => `${count} ${count === 1 ? 'unidad disponible' : 'unidades disponibles'}`
const aborted = () => new DOMException('aborted', 'AbortError')

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(aborted())
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(aborted())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

type Outcome = { line: LineDraft | null; notice?: string }

// Rebuilds a stored sale from the services. Only a definite "not found" (404) or an inactive
// record removes something; any other failure rejects the whole restoration, so a network or
// permission problem never silently empties a person's sale. Server data wins over anything stored.
export async function restoreDraft(record: DraftRecord, loaders: DraftLoaders, signal: AbortSignal): Promise<RestoredDraft> {
  let customer: CustomerChoice | null = null
  const notices: string[] = []
  const outcomes: Outcome[] = new Array(record.lines.length)

  const tasks: (() => Promise<void>)[] = []
  if (record.customerId) {
    const customerId = record.customerId
    tasks.push(async () => {
      try {
        const found = await untilAborted(loaders.loadCustomer(customerId, signal), signal)
        if (found.active) customer = { customerId: found.customerId, name: found.name, identityDocument: found.identityDocument }
        else notices.push(CUSTOMER_UNAVAILABLE_NOTICE)
      } catch (error) {
        if (!isNotFound(error)) throw error
        notices.push(CUSTOMER_UNAVAILABLE_NOTICE)
      }
    })
  }
  record.lines.forEach(({ productId, quantity }, index) => {
    tasks.push(async () => {
      let product: Product
      try {
        product = await untilAborted(loaders.loadProduct(productId, signal), signal)
      } catch (error) {
        if (!isNotFound(error)) throw error
        outcomes[index] = { line: null, notice: 'Un producto se quitó de la venta: ya no está disponible.' }
        return
      }
      if (!product.active) { outcomes[index] = { line: null, notice: `${product.name} se quitó de la venta: ya no está disponible.` }; return }
      const stock = Number.isSafeInteger(product.stock) && product.stock > 0 ? product.stock : 0
      if (stock === 0) { outcomes[index] = { line: null, notice: `${product.name} se quitó de la venta: está agotado.` }; return }
      if (quantity > stock) {
        outcomes[index] = {
          line: { ...newLine(), product, quantity: String(stock) },
          notice: `${product.name}: solo hay ${units(stock)}; se ajustó la cantidad de ${quantity} a ${stock}.`,
        }
        return
      }
      outcomes[index] = { line: { ...newLine(), product, quantity: String(quantity) } }
    })
  })

  await untilAborted(runPool(tasks, RESTORE_CONCURRENCY), signal)
  if (signal.aborted) throw aborted()
  const lines: LineDraft[] = []
  for (const outcome of outcomes) {
    if (outcome.line) lines.push(outcome.line)
    if (outcome.notice) notices.push(outcome.notice)
  }
  return { customer, lines, notices }
}
