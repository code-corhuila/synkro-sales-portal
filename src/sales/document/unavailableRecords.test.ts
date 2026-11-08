import { readFileSync } from 'node:fs'
import { validateXML } from 'xmllint-wasm'
import { apiClient } from '../../test-doubles/shellApiClient'
import { customerFixture, failure, ids, pageOf, productFixture, saleFixture } from '../../test-doubles/fixtures'
import { issuerFixture, NOW } from '../../test-doubles/saleDocument'
import { loadSaleDocumentSources } from '../api/saleDocumentApi'
import { buildSaleDocument } from './buildSaleDocument'
import { buildSaleDocumentXml } from './saleDocumentXml'

function serve(customerStatus = 404, productStatus = 404) {
  apiClient.request.mockReset().mockImplementation(async path => {
    if (path.startsWith('/api/v1/sales/')) return saleFixture()
    if (path === '/api/v1/products/categories') return pageOf([])
    if (path.startsWith('/api/v1/customers/')) {
      if (customerStatus !== 200) throw failure(customerStatus)
      return customerFixture()
    }
    if (productStatus !== 200) throw failure(productStatus)
    return productFixture()
  })
}

it('exports authorized historical references after related records answer404, with explicit unavailable provenance', async () => {
  serve()
  const sources = await loadSaleDocumentSources(ids.sale)
  const model = buildSaleDocument({ ...sources, issuer: issuerFixture(), now: NOW })
  const xml = buildSaleDocumentXml(model)
  expect(model.customer.currentRecordAvailable).toBe(false)
  expect(model.lines[0].currentRecordAvailable).toBe(false)
  expect(xml).toContain('origin="UNAVAILABLE"')
  expect(xml).toContain(`<customerId>${sources.sale.customerId}</customerId>`)
  expect(xml).toContain(`<productId>${sources.sale.details[0].productId}</productId>`)
  expect(xml).toContain(`<totalCents>${sources.sale.totalCents}</totalCents>`)
  expect(xml).not.toContain('<name>Datos actuales no disponibles</name>')
  expect(xml).not.toContain('<identityDocument>')
  expect(xml).toContain('<unavailable>Datos actuales no disponibles</unavailable>')
  const schema = readFileSync('docs/schemas/sale-document-1.1.xsd', 'utf8')
  expect((await validateXML({ xml:[{fileName:'document.xml',contents:xml}], schema:[{fileName:'sale-document-1.1.xsd',contents:schema}] })).valid).toBe(true)
})

it.each([401,403,429,500])('does not downgrade customer HTTP%i to an unavailable reference', async status => {
  serve(status,200)
  await expect(loadSaleDocumentSources(ids.sale)).rejects.toBeDefined()
})

it.each([401,403,429,500])('does not downgrade product HTTP%i to an unavailable reference', async status => {
  serve(200,status)
  await expect(loadSaleDocumentSources(ids.sale)).rejects.toBeDefined()
})

it('does not downgrade a network failure or malformed successful record to a404', async () => {
  serve(200,200)
  apiClient.request.mockImplementation(async path => {
    if (path.startsWith('/api/v1/sales/')) return saleFixture()
    if (path === '/api/v1/products/categories') return pageOf([])
    throw new Error('offline')
  })
  await expect(loadSaleDocumentSources(ids.sale)).rejects.toMatchObject({code:'TRANSPORT'})
})
