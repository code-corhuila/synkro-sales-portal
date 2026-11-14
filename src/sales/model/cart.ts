import type { Product } from './product'
import { MAX_LINES, newLine, parseQuantity, type LineDraft } from './saleForm'

// The catalogue/cart rules, as pure functions over the sale draft's lines. The cart keeps the
// existing LineDraft shape on purpose: validation, the Workflow request and the intent
// fingerprint stay exactly as they were. Stock here is only the last observed value: the server's
// reservation is the one that decides, and a later rejection is handled by the registration saga.

export type StockKind = 'available' | 'low' | 'out'
export interface StockBadge { kind: StockKind; label: string }

// Presentation only. These thresholds say nothing about the Worker's low-stock alerts.
export const LOW_STOCK_MAX = 10

export function stockBadge(stock: number): StockBadge {
  if (!Number.isSafeInteger(stock) || stock <= 0) return { kind: 'out', label: 'Agotado' }
  if (stock <= LOW_STOCK_MAX) return { kind: 'low', label: `Quedan ${stock}` }
  return { kind: 'available', label: 'Disponible' }
}

export interface CartResult { lines: LineDraft[]; notice?: string }

const limitNotice = (stock: number) => `Solo hay ${stock} ${stock === 1 ? 'unidad disponible' : 'unidades disponibles'}.`

const observedStock = (product: Product): number => (Number.isSafeInteger(product.stock) && product.stock > 0 ? product.stock : 0)

// One click adds one unit. Repeating the click on the same product raises its single entry.
export function addProduct(lines: readonly LineDraft[], product: Product): CartResult {
  const stock = observedStock(product)
  if (stock === 0) return { lines: [...lines], notice: `${product.name} está agotado.` }
  const index = lines.findIndex((line) => line.product?.productId === product.productId)
  if (index === -1) {
    if (lines.length >= MAX_LINES) return { lines: [...lines], notice: 'Una venta admite hasta 100 líneas.' }
    return { lines: [...lines, { ...newLine(), product, quantity: '1' }] }
  }
  const current = parseQuantity(lines[index].quantity) ?? 0
  // The catalogue answer is newer than the stock the line remembered.
  const refreshed = lines.map((line, i) => (i === index ? { ...line, product } : line))
  if (current + 1 > stock) {
    const capped = Math.min(current, stock)
    return {
      lines: refreshed.map((line, i) => (i === index ? { ...line, quantity: String(capped) } : line)),
      notice: limitNotice(stock),
    }
  }
  return { lines: refreshed.map((line, i) => (i === index ? { ...line, quantity: String(current + 1) } : line)) }
}

// Minus on one unit removes the entry; an unreadable quantity is removed rather than guessed.
export function decrementLine(lines: readonly LineDraft[], id: string): LineDraft[] {
  return lines.flatMap((line) => {
    if (line.id !== id) return [line]
    const current = parseQuantity(line.quantity)
    if (current === null || current <= 1) return []
    return [{ ...line, quantity: String(current - 1) }]
  })
}

export const removeLine = (lines: readonly LineDraft[], id: string): LineDraft[] => lines.filter((line) => line.id !== id)

// Typed input. Empty is allowed while typing; anything else must be a whole number of at least one.
export function setLineQuantity(lines: readonly LineDraft[], id: string, text: string): CartResult {
  const target = lines.find((line) => line.id === id)
  if (!target) return { lines: [...lines] }
  const replace = (quantity: string) => lines.map((line) => (line.id === id ? { ...line, quantity } : line))
  if (text.trim() === '') return { lines: replace('') }
  const quantity = parseQuantity(text)
  if (quantity === null) return { lines: [...lines], notice: 'Ingresa una cantidad entera mayor que cero.' }
  const stock = target.product ? observedStock(target.product) : 0
  if (target.product && quantity > stock) return { lines: replace(String(stock)), notice: limitNotice(stock) }
  return { lines: replace(String(quantity)) }
}
