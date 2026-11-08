// @vitest-environment node

// Generating a PDF embeds fonts and lays out text: under coverage and a busy CI runner it needs more than 5 s.
vi.setConfig({ testTimeout: 60_000 })
import { customerFixture, ids, saleFixture } from '../../test-doubles/fixtures'
import { issuerFixture, manyLines, NOW, readPdf } from '../../test-doubles/saleDocument'
import { formatCents } from '../model/formatting'
import { buildSaleDocument } from './buildSaleDocument'
import { buildSaleDocumentPdf } from './pdf/buildSaleDocumentPdf'
import { buildSaleDocumentXml } from './saleDocumentXml'

const squash = (value: string) => value.replace(/\s+/g, ' ')
const money = (cents: number) => squash(formatCents(cents)).trim()
const numbers = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}>(\\d+)</${tag}>`, 'g'))].map(([, value]) => Number(value))

async function exportBoth(count: number, active = true) {
  const { sale, products } = manyLines(count)
  const persisted = { ...sale, active }
  const categories = { [ids.category]: 'Periféricos' }
  const model = buildSaleDocument({ sale: persisted, customer: customerFixture(), products, categories, issuer: issuerFixture(), now: NOW })
  const xml = buildSaleDocumentXml(model)
  const { pages } = await readPdf(await buildSaleDocumentPdf(model))
  return { persisted, model, xml, text: squash(pages.map((page) => page.text).join(' ')), pages }
}

it('PDF, XML y detalle persistido coinciden en identificador, estado, cantidades e importes (venta de varias páginas)', async () => {
  const { persisted, xml, text, pages } = await exportBoth(45)
  expect(pages.length).toBeGreaterThan(1)

  // Identifier: the full saleId, in both files.
  expect(xml).toContain(`<saleId>${persisted.saleId}</saleId>`)
  expect(text).toContain(persisted.saleId)

  // XML equals the persisted sale, field by field.
  expect(numbers(xml, 'quantity')).toEqual(persisted.details.map((line) => line.quantity))
  expect(numbers(xml, 'unitPriceCents')).toEqual(persisted.details.map((line) => line.unitPriceCents))
  expect(numbers(xml, 'subtotalCents')).toEqual(persisted.details.map((line) => line.subtotalCents))
  expect(numbers(xml, 'totalCents')).toEqual([persisted.totalCents])

  // PDF shows the same amounts, formatted, and no amount that is not in the sale.
  for (const line of persisted.details) {
    expect(text).toContain(money(line.unitPriceCents))
    expect(text).toContain(money(line.subtotalCents))
  }
  expect(text).toContain(money(persisted.totalCents))
  const shown = new Set([...text.matchAll(/\$ \d{1,3}(?:\.\d{3})*,\d{2}/g)].map(([value]) => value))
  const allowed = new Set([...persisted.details.flatMap((line) => [line.unitPriceCents, line.subtotalCents]), persisted.totalCents].map(money))
  expect([...shown].filter((value) => !allowed.has(value))).toEqual([])
})

it('un documento de una sola venta anulada dice VOIDED en el XML y ANULADA en el PDF', async () => {
  const { xml, text } = await exportBoth(3, false)
  expect(xml).toContain('<status>VOIDED</status>')
  expect(text).toContain('ANULADA')
})

it('el estado activo es ACTIVE en el XML y no hay sello en el PDF', async () => {
  const { xml, text } = await exportBoth(3, true)
  expect(xml).toContain('<status>ACTIVE</status>')
  expect(text).not.toContain('ANULADA')
})

it('cambios posteriores del catálogo no alteran los importes exportados', async () => {
  const { sale, products } = manyLines(2)
  const repriced = Object.fromEntries(Object.entries(products).map(([id, product]) => [id, { ...product, priceCents: 1 }]))
  const build = (catalog: typeof products) => buildSaleDocumentXml(buildSaleDocument({ sale: saleFixture(sale), customer: customerFixture(), products: catalog, categories: {}, issuer: issuerFixture(), now: NOW }))
  expect(build(repriced)).toBe(build(products))
})
