import { customerFixture, ids, productFixture, saleFixture } from '../../test-doubles/fixtures'
import { issuerFixture, NOW } from '../../test-doubles/saleDocument'
import { buildSaleDocument } from './buildSaleDocument'
import { SaleDocumentError } from './types'

const products = {
  [ids.productA]: productFixture({ productId: ids.productA, name: 'Teclado mecánico', priceCents: 999_999 }),
  [ids.productB]: productFixture({ productId: ids.productB, name: 'Ratón óptico', priceCents: 999_999, categoryId: ids.category }),
}
const sale = saleFixture({
  totalCents: 37_657,
  details: [
    { detailId: 'a', productId: ids.productA, quantity: 3, unitPriceCents: 12_550, subtotalCents: 37_650, active: true },
    { detailId: 'b', productId: ids.productB, quantity: 1, unitPriceCents: 7, subtotalCents: 7, active: true },
  ],
})
const base = { sale, customer: customerFixture(), products, categories: { [ids.category]: 'Periféricos' }, issuer: issuerFixture(), now: NOW }
const failureOf = (input: Parameters<typeof buildSaleDocument>[0]) => {
  try { buildSaleDocument(input) } catch (error) { return error as SaleDocumentError }
  throw new Error('se esperaba un fallo')
}

it('conserva cantidades, precios unitarios, subtotales y total persistidos: nunca reprecia con el catálogo actual', () => {
  const document = buildSaleDocument(base)
  expect(document.lines.map((line) => [line.quantity, line.unitPriceCents, line.subtotalCents])).toEqual([[3, 12_550, 37_650], [1, 7, 7]])
  expect(document.totalCents).toBe(37_657)
  expect(document.unitCount).toBe(4)
  expect(JSON.stringify(document)).not.toContain('999999')
})

it('usa el saleId completo como identificador y distingue la fecha de venta de la de generación', () => {
  const document = buildSaleDocument(base)
  expect(document.saleId).toBe(ids.sale)
  expect(document.saleDate).toBe('2026-10-12T15:00:02Z')
  expect(document.generatedAt).toBe('2026-11-07T01:30:00Z')
  expect(document.schemaVersion).toBe('1.2')
  expect(document.documentType).toBe('COMMERCIAL_RECEIPT')
  expect(document.currency).toBe('COP')
})

it('normaliza la fecha de venta a un instante UTC sin perder los milisegundos reales', () => {
  expect(buildSaleDocument({ ...base, sale: { ...sale, date: '2026-10-12T10:00:02-05:00' } }).saleDate).toBe('2026-10-12T15:00:02Z')
  expect(buildSaleDocument({ ...base, sale: { ...sale, date: '2026-10-12T15:00:02.250Z' } }).saleDate).toBe('2026-10-12T15:00:02.250Z')
})

it('enumera las líneas en el orden almacenado, con producto y categoría actuales', () => {
  const document = buildSaleDocument(base)
  expect(document.lines.map((line) => [line.position, line.productId, line.productName, line.categoryName])).toEqual([
    [1, ids.productA, 'Teclado mecánico', 'Periféricos'], [2, ids.productB, 'Ratón óptico', 'Periféricos'],
  ])
})

it('omite la categoría cuando no se pudo asociar, sin inventarla', () => {
  const document = buildSaleDocument({ ...base, categories: {} })
  expect(document.lines.every((line) => !('categoryName' in line))).toBe(true)
})

it('no incluye ningún campo de impuestos, base gravable, consecutivo, CUFE, SKU, unidad de medida ni vendedor', () => {
  const text = JSON.stringify(buildSaleDocument(base)).toLowerCase()
  for (const forbidden of ['base', 'consecutive', 'cufe', 'sku', 'uom', 'createdby', 'seller', 'payment', 'detailid']) {
    expect(text).not.toContain(forbidden)
  }
})

it('omite los contactos opcionales ausentes del cliente y no escribe undefined ni null', () => {
  const document = buildSaleDocument({ ...base, customer: customerFixture({ email: null, phone: undefined, address: '   ' }) })
  expect(document.customer).toEqual({ customerId: ids.customer, name: 'Ana Pérez', identityDocument: '1075123456' })
  expect(JSON.stringify(document)).not.toMatch(/undefined|null/)
})

it('conserva los datos de contacto presentes', () => {
  const customer = buildSaleDocument({ ...base, customer: customerFixture({ email: 'a@b.test', phone: '3100000000', address: 'Calle 1' }) }).customer
  expect(customer).toMatchObject({ email: 'a@b.test', phone: '3100000000', address: 'Calle 1' })
})

it('marca una venta anulada como VOIDED y una activa como ACTIVE', () => {
  expect(buildSaleDocument({ ...base, sale: { ...sale, active: false } }).status).toBe('VOIDED')
  expect(buildSaleDocument(base).status).toBe('ACTIVE')
})

it('sanea espacios, saltos y caracteres que XML 1.0 no admite, igual para PDF y XML', () => {
  const dirty = productFixture({ productId: ids.productA, name: 'Cable\u0000 USB\u000B  tipo\nC￿\uD800' })
  const document = buildSaleDocument({ ...base, products: { ...products, [ids.productA]: dirty } })
  expect(document.lines[0].productName).toBe('Cable� USB� tipo C��')
})

it('conserva acentos, ñ, comillas, ampersand y símbolos de los nombres', () => {
  const name = 'Niño Ñandú & “Café” <ñ> \'x\' ¿Qué? €'
  const document = buildSaleDocument({ ...base, products: { ...products, [ids.productA]: productFixture({ productId: ids.productA, name }) } })
  expect(document.lines[0].productName).toBe(name)
})

it('conserva los centavos enteros de importes grandes dentro del rango seguro', () => {
  const big = saleFixture({ totalCents: 9_007_199_254_740_991, details: [{ detailId: 'a', productId: ids.productA, quantity: 1, unitPriceCents: 9_007_199_254_740_991, subtotalCents: 9_007_199_254_740_991, active: true }] })
  expect(buildSaleDocument({ ...base, sale: big }).totalCents).toBe(9_007_199_254_740_991)
})

describe('falla de forma explícita, sin producir un documento parcial', () => {
  it('rechaza una venta sin líneas', () => {
    expect(failureOf({ ...base, sale: { ...sale, details: [], totalCents: 0 } }).code).toBe('INVALID_SALE')
  })
  it('rechaza un total que no es la suma de los subtotales persistidos', () => {
    const error = failureOf({ ...base, sale: { ...sale, totalCents: 37_658 } })
    expect(error.code).toBe('INVALID_SALE')
    expect(error.details).toContain('totalCents')
  })
  it('rechaza un subtotal distinto de cantidad por precio unitario', () => {
    const broken = { ...sale, details: [{ ...sale.details[0], subtotalCents: 1 }, sale.details[1]] }
    expect(failureOf({ ...base, sale: broken }).code).toBe('INVALID_SALE')
  })
  it('rechaza importes o cantidades fuera del rango seguro, no enteros o inválidos', () => {
    for (const patch of [{ unitPriceCents: 12.5 }, { quantity: 0 }, { quantity: 2_147_483_648 }, { unitPriceCents: -1 }, { unitPriceCents: 2 ** 53 }]) {
      const broken = { ...sale, details: [{ ...sale.details[0], ...patch }, sale.details[1]] }
      expect(failureOf({ ...base, sale: broken }).code).toBe('INVALID_SALE')
    }
  })
  it('rechaza una fecha de venta inválida', () => {
    expect(failureOf({ ...base, sale: { ...sale, date: 'no-es-fecha' } }).details).toContain('date')
  })
  it('rechaza un detalle inactivo en lugar de presentarlo como activo', () => {
    const broken = { ...sale, details: [{ ...sale.details[0], active: false }, sale.details[1]] }
    expect(failureOf({ ...base, sale: broken }).code).toBe('INVALID_SALE')
  })
  it('rechaza un indicador active ambiguo o no booleano en vez de interpretarlo por veracidad', () => {
    for (const active of ['false', 'true', 0, 1, null, undefined, 'ACTIVE', {}, []]) {
      const broken = { ...sale, active } as unknown as typeof sale
      const error = failureOf({ ...base, sale: broken })
      expect(error.code).toBe('INVALID_SALE')
      expect(error.details).toContain('active')
    }
  })
  it('rechaza un cliente que no corresponde a la venta', () => {
    expect(failureOf({ ...base, customer: customerFixture({ customerId: ids.productA }) }).code).toBe('INVALID_SALE')
  })
  it('rechaza un cliente sin nombre o sin documento', () => {
    expect(failureOf({ ...base, customer: customerFixture({ name: '  ' }) }).code).toBe('CUSTOMER_UNAVAILABLE')
    expect(failureOf({ ...base, customer: customerFixture({ identityDocument: '' }) }).code).toBe('CUSTOMER_UNAVAILABLE')
  })
  it('rechaza una línea cuyo producto no se pudo resolver, indicando cuál', () => {
    const error = failureOf({ ...base, products: { [ids.productA]: products[ids.productA] } })
    expect(error.code).toBe('PRODUCT_UNAVAILABLE')
    expect(error.details).toEqual([ids.productB])
  })
})

it('copia el consecutivo comercial de la venta guardada y conserva el saleId interno', () => {
  const document = buildSaleDocument({ ...base, sale: { ...sale, commercialNumber: 'VEN-2026-000042' } })
  expect(document.commercialNumber).toBe('VEN-2026-000042')
  expect(document.saleId).toBe(ids.sale)
})

it('sin consecutivo en la venta, el documento no lo inventa', () => {
  const document = buildSaleDocument(base)
  expect('commercialNumber' in document).toBe(false)
})

it('un consecutivo con formato incorrecto no llega a un documento (assertRenderable lo rechaza)', async () => {
  const { buildSaleDocumentXml } = await import('./saleDocumentXml')
  const document = buildSaleDocument({ ...base, sale: { ...sale, commercialNumber: 'FAC-1' } })
  expect(() => buildSaleDocumentXml(document)).toThrow(/commercial number/)
})
