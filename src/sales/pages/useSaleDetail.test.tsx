import { act, renderHook, waitFor } from '@testing-library/react'
import { apiClient } from '../../test-doubles/shellApiClient'
import { customerFixture, deferred, failure, ids, productFixture, saleFixture } from '../../test-doubles/fixtures'
import { MAX_METADATA_CONCURRENCY, useSaleDetail } from './useSaleDetail'

const product = (n: number) => `550e8400-e29b-41d4-a716-4466554410${String(n).padStart(2, '0')}`
const line = (productId: string, n = 1) => ({ detailId: `d${n}${productId.slice(-2)}`, productId, quantity: 2, unitPriceCents: 1000, subtotalCents: 2000, active: true })
const sale = (details = [line(ids.productA), line(ids.productB, 2), line(ids.productA, 3)]) => saleFixture({ details, totalCents: 6000 })

type Handler = (path: string, signal?: AbortSignal) => Promise<unknown>
function backend(overrides: Partial<Record<'sale' | 'customer' | 'product', Handler>> = {}) {
  apiClient.request.mockImplementation((path, options) => {
    if (path === `/api/v1/sales/${ids.sale}`) return (overrides.sale ?? (() => Promise.resolve(sale())))(path, options?.signal)
    if (path.startsWith('/api/v1/customers/')) return (overrides.customer ?? (() => Promise.resolve(customerFixture())))(path, options?.signal)
    if (path.startsWith('/api/v1/products/')) {
      return (overrides.product ?? ((p) => Promise.resolve(productFixture({ productId: p.split('/').pop(), name: `Producto ${p.slice(-2)}`, priceCents: 99999 }))))(path, options?.signal)
    }
    return Promise.reject(new Error(`unexpected ${path}`))
  })
}
const paths = (prefix: string) => apiClient.request.mock.calls.map(([path]) => path).filter((path) => path.startsWith(prefix))

beforeEach(() => { apiClient.request.mockReset() })

it('lee la venta autoritativa y compone cliente y productos distintos con el cliente compartido', async () => {
  backend()
  const { result } = renderHook(() => useSaleDetail(ids.sale))
  expect(result.current.sale.status).toBe('loading')
  await waitFor(() => expect(result.current.customer.status).toBe('ready'))
  await waitFor(() => expect(Object.values(result.current.products).every((entry) => entry.status === 'ready')).toBe(true))
  expect(result.current.sale).toMatchObject({ status: 'ready', value: { saleId: ids.sale, totalCents: 6000 } })
  expect(paths('/api/v1/sales')).toEqual([`/api/v1/sales/${ids.sale}`])
  expect(paths('/api/v1/customers')).toEqual([`/api/v1/customers/${ids.customer}`])
  expect(paths('/api/v1/products').sort()).toEqual([`/api/v1/products/${ids.productA}`, `/api/v1/products/${ids.productB}`])
  expect(apiClient.request.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true)
})

it('no pide metadatos si la venta falla y no inventa endpoints de lote', async () => {
  backend({ sale: () => Promise.reject(failure(500)) })
  const { result } = renderHook(() => useSaleDetail(ids.sale))
  await waitFor(() => expect(result.current.sale.status).toBe('error'))
  expect(paths('/api/v1/customers')).toHaveLength(0)
  expect(paths('/api/v1/products')).toHaveLength(0)
  expect(apiClient.request.mock.calls.some(([path, options]) => path.includes('?') || Boolean(options?.query))).toBe(false)
})

it.each([
  [403, 'forbidden'],
  [404, 'notFound'],
  [500, 'error'],
  [0, 'error'],
] as const)('responde %s del Sales API como %s', async (status, expected) => {
  backend({ sale: () => Promise.reject(failure(status)) })
  const { result } = renderHook(() => useSaleDetail(ids.sale))
  await waitFor(() => expect(result.current.sale.status).toBe(expected))
})

it('un identificador que no es UUID es «no encontrada» sin llamar al backend', () => {
  backend()
  const { result } = renderHook(() => useSaleDetail('../reports'))
  expect(result.current.sale.status).toBe('notFound')
  expect(apiClient.request).not.toHaveBeenCalled()
})

it('retry vuelve a pedir la venta tras un error', async () => {
  let attempts = 0
  backend({ sale: () => (++attempts === 1 ? Promise.reject(failure(503)) : Promise.resolve(sale())) })
  const { result } = renderHook(() => useSaleDetail(ids.sale))
  await waitFor(() => expect(result.current.sale.status).toBe('error'))
  act(() => result.current.retry())
  await waitFor(() => expect(result.current.sale.status).toBe('ready'))
})

it('un fallo del cliente no oculta la venta ni los productos', async () => {
  backend({ customer: () => Promise.reject(failure(404)) })
  const { result } = renderHook(() => useSaleDetail(ids.sale))
  await waitFor(() => expect(result.current.customer.status).toBe('unavailable'))
  await waitFor(() => expect(Object.values(result.current.products).every((entry) => entry.status === 'ready')).toBe(true))
  expect(result.current.sale.status).toBe('ready')
  expect(result.current.metadataFailed).toBe(true)
})

it('un producto que falla queda no disponible sin afectar a los demás; retryMetadata solo repite lo fallido', async () => {
  let fail = true
  backend({ product: (path) => (path.endsWith(ids.productB) && fail ? Promise.reject(failure(404)) : Promise.resolve(productFixture({ productId: path.split('/').pop(), name: 'Nombre' }))) })
  const { result } = renderHook(() => useSaleDetail(ids.sale))
  await waitFor(() => expect(result.current.products[ids.productB]?.status).toBe('unavailable'))
  expect(result.current.products[ids.productA]).toMatchObject({ status: 'ready' })
  expect(result.current.metadataFailed).toBe(true)
  const before = apiClient.request.mock.calls.length
  fail = false
  act(() => result.current.retryMetadata())
  await waitFor(() => expect(result.current.products[ids.productB]?.status).toBe('ready'))
  expect(apiClient.request.mock.calls.slice(before).map(([path]) => path)).toEqual([`/api/v1/products/${ids.productB}`])
  expect(result.current.metadataFailed).toBe(false)
})

it(`limita a ${MAX_METADATA_CONCURRENCY} las consultas de producto en vuelo`, async () => {
  const many = Array.from({ length: 12 }, (_, index) => line(product(index), index + 1))
  let inFlight = 0
  let peak = 0
  backend({
    sale: () => Promise.resolve(sale(many)),
    product: (path) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      return new Promise((resolve) => setTimeout(() => { inFlight -= 1; resolve(productFixture({ productId: path.split('/').pop(), name: 'P' })) }, 5))
    },
  })
  const { result } = renderHook(() => useSaleDetail(ids.sale))
  await waitFor(() => expect(Object.keys(result.current.products)).toHaveLength(12))
  await waitFor(() => expect(Object.values(result.current.products).every((entry) => entry.status === 'ready')).toBe(true), { timeout: 3000 })
  expect(peak).toBeLessThanOrEqual(MAX_METADATA_CONCURRENCY)
  expect(peak).toBeGreaterThan(1)
  expect(paths('/api/v1/products')).toHaveLength(12)
})

it('cancela todas las consultas al desmontar y no actualiza estado después', async () => {
  const signals: AbortSignal[] = []
  const slowCustomer = deferred()
  backend({
    customer: (_path, signal) => { signals.push(signal!); return slowCustomer.promise },
    product: (_path, signal) => { signals.push(signal!); return new Promise(() => {}) },
  })
  const { result, unmount } = renderHook(() => useSaleDetail(ids.sale))
  await waitFor(() => expect(signals.length).toBe(3))
  unmount()
  expect(signals.every((signal) => signal.aborted)).toBe(true)
  slowCustomer.resolve(customerFixture())
  await act(async () => { await Promise.resolve() })
  expect(result.current.customer.status).toBe('loading')
})

it('ignora la respuesta tardía de una venta anterior al cambiar de identificador', async () => {
  const slow = deferred()
  const other = '550e8400-e29b-41d4-a716-446655440999'
  apiClient.request.mockImplementation((path) => {
    if (path === `/api/v1/sales/${ids.sale}`) return slow.promise
    if (path === `/api/v1/sales/${other}`) return Promise.resolve(saleFixture({ saleId: other, details: [] }))
    if (path.startsWith('/api/v1/customers/')) return Promise.resolve(customerFixture())
    return Promise.reject(new Error(path))
  })
  const { result, rerender } = renderHook(({ id }) => useSaleDetail(id), { initialProps: { id: ids.sale } })
  rerender({ id: other })
  await waitFor(() => expect(result.current.sale).toMatchObject({ status: 'ready', value: { saleId: other } }))
  await act(async () => { slow.resolve(sale()) })
  expect(result.current.sale).toMatchObject({ status: 'ready', value: { saleId: other } })
})
