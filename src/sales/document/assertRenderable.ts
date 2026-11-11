import { MAX_INT32, MAX_SAFE_CENTS, type SaleDocument } from './types'

// Last line of defence before a file is produced: a model that cannot be written faithfully is refused
// instead of being written partially. (buildSaleDocument already enforces this for real sales.)
export function assertRenderable(document: SaleDocument): void {
  const problems: string[] = []
  const amount = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_SAFE_CENTS
  if (document.lines.length === 0) problems.push('lines')
  let sum = 0n
  for (const line of document.lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_INT32) problems.push(`quantity ${line.position}`)
    if (!amount(line.unitPriceCents) || !amount(line.subtotalCents)) problems.push(`amount ${line.position}`)
    else {
      if (BigInt(line.quantity) * BigInt(line.unitPriceCents) !== BigInt(line.subtotalCents)) problems.push(`subtotal ${line.position}`)
      sum += BigInt(line.subtotalCents)
    }
  }
  if (!amount(document.totalCents) || BigInt(document.totalCents) !== sum) problems.push('total')
  if (Number.isNaN(Date.parse(document.saleDate)) || Number.isNaN(Date.parse(document.generatedAt))) problems.push('dates')
  if (!document.saleId || !document.issuer.legalName || !document.issuer.taxId || !document.customer.name) problems.push('identity')
  if (problems.length) throw new Error(`Documento no representable: ${problems.join(', ')}`)
}
