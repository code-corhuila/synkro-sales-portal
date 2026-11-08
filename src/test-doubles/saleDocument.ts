// Synthetic data and an independent PDF reader for the sale-document tests only.
import type { SaleDocument, SaleDocumentIssuer } from '../sales/document/types'
import { customerFixture, ids, productFixture, saleFixture } from './fixtures'

export const NOW = new Date('2026-11-07T01:30:00Z') // 2026-11-06 20:30 in America/Bogota

export const issuerFixture = (overrides: Partial<SaleDocumentIssuer> = {}): SaleDocumentIssuer => ({
  legalName: 'Comercializadora Prueba S.A.S.',
  taxId: '800123456-7',
  address: 'Carrera 10 # 20-30, Neiva',
  phone: '+57 608 871 2345',
  email: 'ventas@prueba.test',
  ...overrides,
})

export const issuerEnv = (overrides: Record<string, string | undefined> = {}) => ({
  VITE_ISSUER_LEGAL_NAME: 'Comercializadora Prueba S.A.S.',
  VITE_ISSUER_TAX_ID: '800123456-7',
  VITE_ISSUER_ADDRESS: 'Carrera 10 # 20-30, Neiva',
  VITE_ISSUER_PHONE: '+57 608 871 2345',
  VITE_ISSUER_EMAIL: 'ventas@prueba.test',
  ...overrides,
})

// A sale with `count` lines whose names are long enough to wrap in the description column.
export function manyLines(count: number, name = (index: number) => `Producto de catálogo número ${index + 1} con una descripción larga para que ocupe más de una línea en la tabla`) {
  const details = Array.from({ length: count }, (_, index) => {
    const quantity = (index % 5) + 1
    const unitPriceCents = 100_000 + index * 1_234_56 + 7
    return {
      detailId: `d${index}`, productId: productIdOf(index), quantity, unitPriceCents,
      subtotalCents: quantity * unitPriceCents, active: true,
    }
  })
  const products = Object.fromEntries(details.map((line, index) => [line.productId, productFixture({
    productId: line.productId, name: name(index), priceCents: 1, categoryId: ids.category,
  })]))
  const totalCents = details.reduce((sum, line) => sum + line.subtotalCents, 0)
  return { sale: saleFixture({ details, totalCents }), products }
}

export const productIdOf = (index: number) => `550e8400-e29b-41d4-a716-${(446655450000 + index).toString().padStart(12, '0')}`

export function documentFixture(overrides: Partial<SaleDocument> = {}): SaleDocument {
  const sale = saleFixture()
  const line = sale.details[0]
  return {
    schemaVersion: '1.0', documentType: 'COMMERCIAL_RECEIPT',
    saleId: sale.saleId, status: 'ACTIVE', saleDate: sale.date, generatedAt: NOW.toISOString().replace('.000Z', 'Z'), currency: 'COP',
    issuer: issuerFixture(),
    customer: { customerId: ids.customer, name: 'Ana Pérez', identityDocument: '1075123456', address: 'Calle 1 # 2-3', phone: '3100000000', email: 'ana@correo.test' },
    lines: [{ position: 1, productId: line.productId, productName: 'Teclado mecánico', categoryName: 'Periféricos', quantity: line.quantity, unitPriceCents: line.unitPriceCents, subtotalCents: line.subtotalCents }],
    unitCount: line.quantity, totalCents: sale.totalCents,
    ...overrides,
  }
}

export { customerFixture }

export interface PdfTextItem { text: string; x: number; y: number; width: number; height: number; rotated: boolean }
export interface PdfPageText { number: number; width: number; height: number; items: PdfTextItem[]; text: string }

// Independent reader (pdf.js): proves the file is a real PDF whose text is selectable and extractable.
export async function readPdf(bytes: Uint8Array): Promise<{ pages: PdfPageText[]; info: Record<string, unknown>; fonts: string[] }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, verbosity: 0 })
  const document = await task.promise
  const pages: PdfPageText[] = []
  const fonts = new Set<string>()
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number)
    const [, , width, height] = page.view
    const content = await page.getTextContent()
    const items = content.items.flatMap((item) => 'str' in item && item.str.trim() ? [{
      text: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height,
      rotated: Math.abs(item.transform[1]) > 0.01 || Math.abs(item.transform[2]) > 0.01,
    }] : [])
    pages.push({ number, width, height, items, text: items.map((item) => item.text).join(' ') })
    await page.getOperatorList()
    for (const key of Object.keys(content.styles)) fonts.add(String((content.styles as Record<string, { fontFamily?: string }>)[key].fontFamily))
  }
  const metadata = await document.getMetadata()
  await task.destroy()
  return { pages, info: metadata.info as Record<string, unknown>, fonts: [...fonts] }
}
