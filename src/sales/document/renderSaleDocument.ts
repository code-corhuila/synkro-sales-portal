import { buildSaleDocumentXml } from './saleDocumentXml'
import { SaleDocumentError, type SaleDocument, type SaleDocumentKind } from './types'

export interface RenderedSaleDocument {
  blob: Blob
  fileName: string
}

const MIME: Record<SaleDocumentKind, string> = { pdf: 'application/pdf', xml: 'application/xml' }

// The saleId is a UUID in practice; this keeps the name safe even if it were not.
export function documentFileName(saleId: string, kind: SaleDocumentKind): string {
  const id = saleId.replace(/[^A-Za-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'venta'
  return `comprobante-venta-${id}.${kind}`
}

// PDF and XML come from the same SaleDocument. The PDF generator (and its fonts) loads on demand.
export async function renderSaleDocument(kind: SaleDocumentKind, document: SaleDocument): Promise<RenderedSaleDocument> {
  try {
    const content = kind === 'xml'
      ? buildSaleDocumentXml(document)
      : new Uint8Array(await (await import('./pdf/buildSaleDocumentPdf')).buildSaleDocumentPdf(document))
    return { blob: new Blob([content], { type: MIME[kind] }), fileName: documentFileName(document.saleId, kind) }
  } catch (error) {
    throw new SaleDocumentError('GENERATION_FAILED', 'No se pudo generar el archivo.', { details: [error instanceof Error ? error.message : String(error)] })
  }
}
