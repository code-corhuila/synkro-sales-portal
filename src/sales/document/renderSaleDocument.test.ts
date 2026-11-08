// @vitest-environment node

// Generating a PDF embeds fonts and lays out text: under coverage and a busy CI runner it needs more than 5 s.
vi.setConfig({ testTimeout: 60_000 })
import { customerFixture, failure, ids, pageOf, productFixture, saleFixture } from '../../test-doubles/fixtures'
import { apiClient } from '../../test-doubles/shellApiClient'
import { documentFixture, issuerEnv, NOW } from '../../test-doubles/saleDocument'
import { prepareSaleDocument } from './prepareSaleDocument'
import { renderSaleDocument } from './renderSaleDocument'
import type { SaleDocumentError } from './types'

const serve = () => apiClient.request.mockReset().mockImplementation((path) => {
  if (path === '/api/v1/products/categories') return Promise.resolve(pageOf([{ categoryId: ids.category, name: 'Periféricos', active: true }]))
  if (path.startsWith('/api/v1/sales/')) return Promise.resolve(saleFixture())
  if (path.startsWith('/api/v1/customers/')) return Promise.resolve(customerFixture())
  if (path.startsWith('/api/v1/products/')) return Promise.resolve(productFixture({ priceCents: 999_999 }))
  return Promise.reject(failure(404))
})
beforeEach(() => { serve() })

describe('prepareSaleDocument', () => {
  it('compone el modelo común con el emisor configurado y la fecha de generación recibida', async () => {
    const model = await prepareSaleDocument(ids.sale, { env: issuerEnv(), now: NOW })
    expect(model).toMatchObject({
      saleId: ids.sale, status: 'ACTIVE', totalCents: 25_100, generatedAt: '2026-11-07T01:30:00Z',
      issuer: { legalName: 'Comercializadora Prueba S.A.S.', taxId: '800123456-7' },
      customer: { name: 'Ana Pérez' },
      lines: [{ productName: 'Teclado mecánico', categoryName: 'Periféricos', quantity: 2, unitPriceCents: 12_550, subtotalCents: 25_100 }],
    })
  })

  it('verifica la configuración del emisor antes de pedir nada al servidor', async () => {
    const error = await prepareSaleDocument(ids.sale, { env: issuerEnv({ VITE_ISSUER_TAX_ID: undefined }), now: NOW }).catch((failed: SaleDocumentError) => failed)
    expect(error).toMatchObject({ code: 'ISSUER_CONFIG', details: ['VITE_ISSUER_TAX_ID'] })
    expect(apiClient.request).not.toHaveBeenCalled()
  })

  it('propaga los errores de autorización sin construir documento', async () => {
    apiClient.request.mockReset().mockRejectedValue(failure(403))
    await expect(prepareSaleDocument(ids.sale, { env: issuerEnv(), now: NOW })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('renderSaleDocument', () => {
  it('XML: tipo MIME, extensión y nombre seguro con el saleId completo', async () => {
    const { blob, fileName } = await renderSaleDocument('xml', documentFixture())
    expect(fileName).toBe(`comprobante-venta-${ids.sale}.xml`)
    expect(blob.type).toBe('application/xml')
    expect(await blob.text()).toContain(`<saleId>${ids.sale}</saleId>`)
  })

  it('PDF: tipo MIME, extensión y archivo PDF no vacío', async () => {
    const { blob, fileName } = await renderSaleDocument('pdf', documentFixture())
    expect(fileName).toBe(`comprobante-venta-${ids.sale}.pdf`)
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(5_000)
    expect(await blob.slice(0, 5).text()).toBe('%PDF-')
  })

  it('el nombre de archivo solo contiene caracteres seguros aunque el identificador no lo sea', async () => {
    const { fileName } = await renderSaleDocument('xml', documentFixture({ saleId: '../../etc/pass wd"<>:|?*\u0000' }))
    expect(fileName).toMatch(/^[A-Za-z0-9._-]+$/)
    expect(fileName).not.toContain('..')
    expect(fileName.endsWith('.xml')).toBe(true)
  })

  it('un fallo al generar se informa como GENERATION_FAILED y no devuelve un archivo parcial', async () => {
    const broken = documentFixture({ lines: [] })
    await expect(renderSaleDocument('pdf', broken)).rejects.toMatchObject({ code: 'GENERATION_FAILED' })
    await expect(renderSaleDocument('xml', broken)).rejects.toMatchObject({ code: 'GENERATION_FAILED' })
  })
})
