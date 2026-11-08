// The common export model. Both the PDF and the XML are derived from one SaleDocument, so
// identifiers, status, quantities and amounts cannot diverge between the two files.
//
// Where each part comes from (docs/sale-documents-design.md):
//   PERSISTED            saleId, status, saleDate, lines (quantity, unit price, subtotal), total — Sales
//   CURRENT_RECORD       customer and product/category descriptions — Customers/Products as they are now
//   CONFIGURATION        issuer — explicit build-time configuration of the portal
export type SaleDocumentStatus = 'ACTIVE' | 'VOIDED'

export interface SaleDocumentIssuer {
  legalName: string
  taxId: string
  address?: string
  phone?: string
  email?: string
}

export interface SaleDocumentCustomer {
  customerId: string
  name: string
  identityDocument: string
  address?: string
  phone?: string
  email?: string
}

export interface SaleDocumentLine {
  position: number
  productId: string
  productName: string
  categoryName?: string
  quantity: number
  unitPriceCents: number
  subtotalCents: number
}

export interface SaleDocument {
  schemaVersion: '1.0'
  documentType: 'COMMERCIAL_RECEIPT'
  saleId: string
  status: SaleDocumentStatus
  // RFC 3339 instants in UTC. The PDF shows them in America/Bogota.
  saleDate: string
  generatedAt: string
  currency: 'COP'
  issuer: SaleDocumentIssuer
  customer: SaleDocumentCustomer
  lines: SaleDocumentLine[]
  unitCount: number
  totalCents: number
}

export type SaleDocumentKind = 'pdf' | 'xml'

export type SaleDocumentErrorCode =
  | 'SESSION_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CUSTOMER_UNAVAILABLE'
  | 'PRODUCT_UNAVAILABLE'
  | 'ISSUER_CONFIG'
  | 'INVALID_SALE'
  | 'TRANSPORT'
  | 'GENERATION_FAILED'

// A failure that already knows what to tell the person. `details` names what is missing or
// inconsistent (never data of another account); `traceId` is the backend's, when it sent one.
export class SaleDocumentError extends Error {
  readonly code: SaleDocumentErrorCode
  readonly details: string[]
  readonly traceId?: string

  constructor(code: SaleDocumentErrorCode, message: string, options: { details?: string[]; traceId?: string } = {}) {
    super(message)
    this.name = 'SaleDocumentError'
    this.code = code
    this.details = options.details ?? []
    this.traceId = options.traceId
  }
}

export const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER
export const MAX_INT32 = 2_147_483_647
