import type { Customer } from '../model/customer'
import type { Product } from '../model/product'
import type { Sale } from '../model/sale'
import { optionalText, sanitizeText } from './text'
import {
  MAX_INT32, MAX_SAFE_CENTS, SaleDocumentError,
  type SaleDocument, type SaleDocumentIssuer, type SaleDocumentLine,
} from './types'

export interface SaleDocumentInput {
  sale: Sale
  customer: Customer | null
  products: Record<string, Product | null>
  // categoryId -> current category name; an unknown category is simply not printed.
  categories: Record<string, string>
  issuer: SaleDocumentIssuer
  now: Date
}

const isAmount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_SAFE_CENTS

// RFC 3339 instant in UTC. Milliseconds appear only when the stored value really has them.
export function toInstant(value: string): string | null {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().replace('.000Z', 'Z')
}

// Builds the one model both files are derived from. Amounts, quantities, date and status are the ones
// persisted in Sales: nothing is repriced from the catalogue and nothing is recomputed except the check
// that the stored subtotals and total are internally consistent. Anything missing or inconsistent stops
// the export with an explicit error. A related-record404 retains its persisted reference and an explicit marker.
export function buildSaleDocument({ sale, customer, products, categories, issuer, now }: SaleDocumentInput): SaleDocument {
  const invalid: string[] = []
  const saleDate = toInstant(sale.date)
  if (!saleDate) invalid.push('date')
  const generatedAt = toInstant(now.toISOString())!

  if (!Array.isArray(sale.details) || sale.details.length === 0) invalid.push('details')
  let sum = 0n
  let units = 0
  const details = Array.isArray(sale.details) ? sale.details : []
  details.forEach((line, index) => {
    const at = `details[${index}]`
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_INT32) invalid.push(`${at}.quantity`)
    if (!isAmount(line.unitPriceCents)) invalid.push(`${at}.unitPriceCents`)
    if (!isAmount(line.subtotalCents)) invalid.push(`${at}.subtotalCents`)
    if (line.active !== true) invalid.push(`${at}.active`)
    if (!invalid.some((field) => field.startsWith(at)) && BigInt(line.quantity) * BigInt(line.unitPriceCents) !== BigInt(line.subtotalCents)) invalid.push(`${at}.subtotalCents`)
    if (isAmount(line.subtotalCents)) sum += BigInt(line.subtotalCents)
    if (Number.isSafeInteger(line.quantity)) units += line.quantity
  })
  if (!isAmount(sale.totalCents) || BigInt(sale.totalCents) !== sum) invalid.push('totalCents')
  // Strict boolean, not truthiness: a malformed or ambiguous value (a string, a number, null) must
  // stop the export instead of silently becoming ACTIVE or VOIDED by coercion.
  if (typeof sale.active !== 'boolean') invalid.push('active')
  if (customer !== null && sale.customerId !== customer.customerId) invalid.push('customerId')
  if (invalid.length) throw new SaleDocumentError('INVALID_SALE', 'La venta tiene datos inconsistentes.', { details: invalid })

  const customerName = customer === null ? 'Datos actuales no disponibles' : sanitizeText(customer.name ?? '')
  const identityDocument = customer === null ? '' : sanitizeText(customer.identityDocument ?? '')
  if (!customerName || (customer !== null && !identityDocument)) {
    throw new SaleDocumentError('CUSTOMER_UNAVAILABLE', 'Faltan el nombre o el documento del cliente.', { details: [sale.customerId] })
  }

  const unavailable = [...new Set(details.filter((line) => products[line.productId] !== null && !sanitizeText(products[line.productId]?.name ?? '')).map((line) => line.productId))]
  if (unavailable.length) throw new SaleDocumentError('PRODUCT_UNAVAILABLE', 'Falta el nombre de uno o más productos.', { details: unavailable })

  const lines: SaleDocumentLine[] = details.map((line, index) => {
    const product = products[line.productId]
    const category = product === null ? 'Datos actuales no disponibles' : optionalText(categories[product.categoryId])
    return {
      position: index + 1,
      productId: line.productId,
      productName: product === null ? `Referencia ${line.productId}` : sanitizeText(product.name),
      ...(product === null ? { currentRecordAvailable: false } : {}),
      ...(category ? { categoryName: category } : {}),
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      subtotalCents: line.subtotalCents,
    }
  })
  const address = optionalText(customer?.address)
  const phone = optionalText(customer?.phone)
  const email = optionalText(customer?.email)

  return {
    schemaVersion: '1.2',
    documentType: 'COMMERCIAL_RECEIPT',
    saleId: sale.saleId,
    ...(sale.commercialNumber ? { commercialNumber: sale.commercialNumber } : {}),
    status: sale.active ? 'ACTIVE' : 'VOIDED',
    saleDate: saleDate!,
    generatedAt,
    currency: 'COP',
    issuer,
    customer: {
      customerId: sale.customerId, name: customerName, identityDocument,
      ...(customer === null ? { currentRecordAvailable: false } : {}),
      ...(address ? { address } : {}), ...(phone ? { phone } : {}), ...(email ? { email } : {}),
    },
    lines,
    unitCount: units,
    totalCents: sale.totalCents,
  }
}
