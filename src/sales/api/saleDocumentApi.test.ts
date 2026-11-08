import { apiClient } from '../../test-doubles/shellApiClient'
import { customerFixture, deferred, failure, ids, pageOf, productFixture, saleFixture } from '../../test-doubles/fixtures'
import { productIdOf } from '../../test-doubles/saleDocument'
import { loadSaleDocumentSources, MAX_SOURCE_CONCURRENCY } from './saleDocumentApi'
import { SaleDocumentError } from '../document/types'

const category = (categoryId: string, name: string) => ({ categoryId, name, active: true })

type Replies = Partial<{
  sale: () => Promise<unknown>
  customer: () => Promise<unknown>
  product: (id: string) => Promise<unknown>
  categories: (page: number) => Promise<unknown>
}>
function serve(replies: Replies = {}) {
  apiClient.request.mockReset().mockImplementation((path, options) => {
    if (path === '/api/v1/products/categories') return (replies.categories ?? (() => Promise.resolve(pageOf([category(ids.category, 'Periféricos')]))))(Number(options?.query?.page))
    if (path.startsWith('/api/v1/sales/')) return (replies.sale ?? (() => Promise.resolve(saleFixture({
      totalCents: 25_100 + 7,
      details: [
        { detailId: 'a', productId: ids.productA, quantity: 2, unitPriceCents: 12_550, subtotalCents: 25_100, active: true },
        { detailId: 'b', productId: ids.productA, quantity: 1, unitPriceCents: 7, subtotalCents: 7, active: true },
      ],
    }))))()
    if (path.startsWith('/api/v1/customers/')) return (replies.customer ?? (() => Promise.resolve(customerFixture())))()
    if (path.startsWith('/api/v1/products/')) return (replies.product ?? ((id) => Promise.resolve(productFixture({ productId: id }))))(path.split('/').pop()!)
    return Promise.reject(new Error(`unexpected ${path}`))
  })
}
const failureOf = async (promise: Promise<unknown>) => {
  try { await promise } catch (error) { return error as SaleDocumentError }
  throw new Error('se esperaba un fallo')
}
const paths = () => apiClient.request.mock.calls.map(([path]) => path)

beforeEach(() => serve())

it('lee la venta autoritativa, el cliente, cada producto distinto y las categorías, solo con GET', async () => {
  const sources = await loadSaleDocumentSources(ids.sale)
  expect(sources.sale.saleId).toBe(ids.sale)
  expect(sources.customer?.name).toBe('Ana Pérez')
  expect(Object.keys(sources.products)).toEqual([ids.productA])
  expect(sources.categories).toEqual({ [ids.category]: 'Periféricos' })
  expect(paths().sort()).toEqual([
    `/api/v1/customers/${ids.customer}`, '/api/v1/products/categories', `/api/v1/products/${ids.productA}`, `/api/v1/sales/${ids.sale}`,
  ].sort())
  expect(apiClient.request.mock.calls.every(([, options]) => !options?.method && !options?.body)).toBe(true)
  expect(apiClient.request.mock.calls[0][0]).toBe(`/api/v1/sales/${ids.sale}`)
})

it('pasa la señal de cancelación a cada petición', async () => {
  const controller = new AbortController()
  await loadSaleDocumentSources(ids.sale, { signal: controller.signal })
  expect(apiClient.request.mock.calls.every(([, options]) => options?.signal === controller.signal)).toBe(true)
})

it('rechaza un identificador que no es un UUID completo sin llamar al servidor', async () => {
  const error = await failureOf(loadSaleDocumentSources('7c2e9a41'))
  expect(error.code).toBe('NOT_FOUND')
  expect(apiClient.request).not.toHaveBeenCalled()
})

it('recorre todas las páginas de categorías con el límite máximo del contrato', async () => {
  serve({
    categories: (page) => Promise.resolve({ data: [category(page === 1 ? ids.category : productIdOf(9), `Categoría ${page}`)], meta: { page, limit: 100, total: 2, totalPages: 2 } }),
  })
  const sources = await loadSaleDocumentSources(ids.sale)
  expect(sources.categories).toEqual({ [ids.category]: 'Categoría 1', [productIdOf(9)]: 'Categoría 2' })
  const queries = apiClient.request.mock.calls.filter(([path]) => path === '/api/v1/products/categories').map(([, options]) => options?.query)
  expect(queries).toEqual([{ page: 1, limit: 100 }, { page: 2, limit: 100 }])
})

it('se detiene con un error explícito si hay más categorías de las que se admiten leer', async () => {
  serve({ categories: (page) => Promise.resolve({ data: [], meta: { page, limit: 100, total: 5_000, totalPages: 50 } }) })
  expect((await failureOf(loadSaleDocumentSources(ids.sale))).code).toBe('TRANSPORT')
})

it('limita la concurrencia de las lecturas de productos', async () => {
  const many = Array.from({ length: 12 }, (_, index) => ({ detailId: `d${index}`, productId: productIdOf(index), quantity: 1, unitPriceCents: 10, subtotalCents: 10, active: true }))
  let running = 0
  let peak = 0
  serve({
    sale: () => Promise.resolve(saleFixture({ totalCents: 120, details: many })),
    product: async (id) => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running -= 1
      return productFixture({ productId: id })
    },
  })
  const sources = await loadSaleDocumentSources(ids.sale)
  expect(Object.keys(sources.products)).toHaveLength(12)
  expect(peak).toBeGreaterThan(1)
  expect(peak).toBeLessThanOrEqual(MAX_SOURCE_CONCURRENCY)
})

describe('autorización y errores', () => {
  it.each([[401, 'SESSION_EXPIRED'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND']] as const)('una venta con %i (%s) no consulta cliente, productos ni categorías', async (status, code) => {
    serve({ sale: () => Promise.reject(failure(status)) })
    const error = await failureOf(loadSaleDocumentSources(ids.sale))
    expect(error).toBeInstanceOf(SaleDocumentError)
    expect(error.code).toBe(code)
    expect(paths()).toEqual([`/api/v1/sales/${ids.sale}`])
  })

  it('un fallo del servidor o de red al leer la venta es reintentable y conserva el traceId', async () => {
    serve({ sale: () => Promise.reject(failure(500)) })
    const error = await failureOf(loadSaleDocumentSources(ids.sale))
    expect(error.code).toBe('TRANSPORT')
    expect(error.traceId).toBe('trace-example')
    serve({ sale: () => Promise.reject({ status: 0 }) })
    expect((await failureOf(loadSaleDocumentSources(ids.sale))).code).toBe('TRANSPORT')
    serve({ sale: () => Promise.reject(new Error('boom')) })
    expect((await failureOf(loadSaleDocumentSources(ids.sale))).code).toBe('TRANSPORT')
  })

  it('un cliente no disponible (404) conserva una ausencia explícita para el comprobante por referencia', async () => {
    serve({ customer: () => Promise.reject(failure(404, 'NOT_FOUND')) })
    expect((await loadSaleDocumentSources(ids.sale)).customer).toBeNull()
  })

  it('un producto oculto (404) conserva la referencia sin revelar datos actuales', async () => {
    serve({ product: () => Promise.reject(failure(404, 'NOT_FOUND')) })
    expect((await loadSaleDocumentSources(ids.sale)).products[ids.productA]).toBeNull()
  })

  it('rechaza un producto cuya respuesta trae un productId distinto del pedido', async () => {
    serve({ product: () => Promise.resolve(productFixture({ productId: ids.productB })) })
    const error = await failureOf(loadSaleDocumentSources(ids.sale))
    expect(error.code).toBe('PRODUCT_UNAVAILABLE')
    expect(error.details).toEqual([ids.productA])
  })

  it.each([[401, 'SESSION_EXPIRED'], [403, 'FORBIDDEN'], [503, 'TRANSPORT']] as const)('un %i al leer el cliente, un producto o las categorías es %s', async (status, code) => {
    serve({ customer: () => Promise.reject(failure(status)) })
    expect((await failureOf(loadSaleDocumentSources(ids.sale))).code).toBe(code)
    serve({ product: () => Promise.reject(failure(status)) })
    expect((await failureOf(loadSaleDocumentSources(ids.sale))).code).toBe(code)
    serve({ categories: () => Promise.reject(failure(status)) })
    expect((await failureOf(loadSaleDocumentSources(ids.sale))).code).toBe(code)
  })

  it('rechaza una respuesta que no corresponde a la venta pedida', async () => {
    serve({ sale: () => Promise.resolve(saleFixture({ saleId: ids.saga })) })
    expect((await failureOf(loadSaleDocumentSources(ids.sale))).code).toBe('INVALID_SALE')
  })

  it('una petición cancelada rechaza sin convertirse en un error de la persona', async () => {
    const pending = deferred()
    serve({ sale: () => pending.promise })
    const controller = new AbortController()
    const promise = loadSaleDocumentSources(ids.sale, { signal: controller.signal })
    controller.abort()
    pending.resolve(saleFixture())
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(paths()).toEqual([`/api/v1/sales/${ids.sale}`])
  })
})
