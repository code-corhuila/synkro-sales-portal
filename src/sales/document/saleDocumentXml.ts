import { assertRenderable } from './assertRenderable'
import { sanitizeText } from './text'
import type { SaleDocument } from './types'

// Commercial XML, schema version 1.1 (docs/schemas/sale-document-1.1.xsd). It is not a fiscal document.
export const SALE_DOCUMENT_NAMESPACE = 'urn:synkro:sales:sale-document:1.1'

// All text goes through the same sanitizer as the PDF (characters XML 1.0 cannot carry become U+FFFD) and is
// then escaped for both text and attribute positions. Nothing is concatenated without passing through here.
export function escapeXml(value: string): string {
  return sanitizeText(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

const integer = (value: number) => String(value)
const element = (indent: number, name: string, value: string, attributes = '') => `${'  '.repeat(indent)}<${name}${attributes}>${escapeXml(value)}</${name}>`
const optional = (indent: number, name: string, value: string | undefined) => value === undefined ? [] : [element(indent, name, value)]

export function buildSaleDocumentXml(document: SaleDocument): string {
  assertRenderable(document)
  const { issuer, customer } = document
  const lines = document.lines.flatMap((line) => [
    `    <line position="${integer(line.position)}">`,
    element(3, 'productId', line.productId),
    `      <product origin="${line.currentRecordAvailable === false ? 'UNAVAILABLE' : 'CURRENT_RECORD'}">`,
    ...(line.currentRecordAvailable === false
      ? [element(4, 'unavailable', 'Datos actuales no disponibles')]
      : [element(4, 'name', line.productName), ...optional(4, 'category', line.categoryName)]),
    '      </product>',
    element(3, 'quantity', integer(line.quantity)),
    element(3, 'unitPriceCents', integer(line.unitPriceCents)),
    element(3, 'subtotalCents', integer(line.subtotalCents)),
    '    </line>',
  ])
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<saleDocument xmlns="${SALE_DOCUMENT_NAMESPACE}" schemaVersion="${document.schemaVersion}">`,
    element(1, 'documentType', document.documentType),
    element(1, 'fiscalValidity', 'NONE'),
    element(1, 'saleId', document.saleId),
    element(1, 'status', document.status),
    element(1, 'saleDate', document.saleDate),
    element(1, 'generatedAt', document.generatedAt),
    element(1, 'currency', document.currency, ' minorUnitDigits="2"'),
    '  <issuer origin="CONFIGURATION">',
    element(2, 'legalName', issuer.legalName),
    element(2, 'taxId', issuer.taxId),
    ...optional(2, 'address', issuer.address),
    ...optional(2, 'phone', issuer.phone),
    ...optional(2, 'email', issuer.email),
    '  </issuer>',
    `  <customer origin="${customer.currentRecordAvailable === false ? 'UNAVAILABLE' : 'CURRENT_RECORD'}">`,
    element(2, 'customerId', customer.customerId),
    ...(customer.currentRecordAvailable === false
      ? [element(2, 'unavailable', 'Datos actuales no disponibles')]
      : [element(2, 'name', customer.name), element(2, 'identityDocument', customer.identityDocument),
        ...optional(2, 'address', customer.address), ...optional(2, 'phone', customer.phone),
        ...optional(2, 'email', customer.email)]),
    '  </customer>',
    `  <lines count="${integer(document.lines.length)}" unitCount="${integer(document.unitCount)}">`,
    ...lines,
    '  </lines>',
    element(1, 'totalCents', integer(document.totalCents)),
    '</saleDocument>',
    '',
  ].join('\n')
}
