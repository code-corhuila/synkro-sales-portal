import type { Customer } from './customer'
import type { Product } from './product'

export const MAX_LINES = 100

export interface LineDraft { id: string; product: Product | null; quantity: string }
export interface SaleDraft { customer: Customer | null; lines: LineDraft[] }
export interface RegisterSaleRequest { customerId: string; lines: { productId: string; quantity: number }[] }
export interface LineErrors { product?: string; quantity?: string }
export interface FormErrors {
  valid: boolean
  customer?: string
  form?: string
  lines: Record<string, LineErrors>
}

let sequence = 0
export const newLine = (): LineDraft => ({ id: `line-${++sequence}`, product: null, quantity: '' })

export function parseQuantity(text: string): number | null {
  const value = text.trim()
  if (!/^[1-9]\d*$/.test(value)) return null
  const quantity = Number(value)
  return Number.isSafeInteger(quantity) ? quantity : null
}

export function validateSaleForm({ customer, lines }: SaleDraft): FormErrors {
  const errors: FormErrors = { valid: true, lines: {} }
  const fail = () => { errors.valid = false }
  if (!customer) { errors.customer = 'Selecciona un cliente.'; fail() }
  if (!lines.length) { errors.form = 'Agrega al menos una línea.'; fail() }
  if (lines.length > MAX_LINES) { errors.form = 'Una venta admite hasta 100 líneas.'; fail() }
  const seen = new Set<string>()
  for (const line of lines) {
    const lineErrors: LineErrors = {}
    if (!line.product) lineErrors.product = 'Selecciona un producto.'
    else if (seen.has(line.product.productId)) lineErrors.product = 'Este producto ya está en otra línea.'
    else seen.add(line.product.productId)
    if (parseQuantity(line.quantity) === null) lineErrors.quantity = 'Ingresa una cantidad entera mayor que cero.'
    if (lineErrors.product || lineErrors.quantity) { errors.lines[line.id] = lineErrors; fail() }
  }
  return errors
}

// Only what the Workflow contract accepts. Prices, subtotals, totals and the author never leave the browser.
export function buildRegisterRequest(draft: SaleDraft): RegisterSaleRequest | null {
  if (!validateSaleForm(draft).valid || !draft.customer) return null
  return {
    customerId: draft.customer.customerId,
    lines: draft.lines.map((line) => ({ productId: line.product!.productId, quantity: parseQuantity(line.quantity)! })),
  }
}

// Catalogue price times quantity, in exact integers. Null whenever it would be a guess.
export function lineSubtotal({ product, quantity }: Pick<LineDraft, 'product' | 'quantity'>): number | null {
  const count = parseQuantity(quantity)
  if (!product || count === null) return null
  const value = BigInt(product.priceCents) * BigInt(count)
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null
}

export function estimateTotal({ lines }: SaleDraft): number | null {
  if (!lines.length) return null
  let total = 0n
  for (const line of lines) {
    const subtotal = lineSubtotal(line)
    if (subtotal === null) return null
    total += BigInt(subtotal)
  }
  return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null
}

// What the person is asking to sell, independent of line order. A new idempotency
// key is a new intent; reordering the same lines must not become one.
export function intentFingerprint({ customerId, lines }: RegisterSaleRequest): string {
  const sorted = lines.map(({ productId, quantity }) => [productId, quantity] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return JSON.stringify([customerId, sorted])
}
