import { act, renderHook, waitFor } from '@testing-library/react'
import { apiClient } from '../../test-doubles/shellApiClient'
import { deferred, ids, pageOf, productFixture } from '../../test-doubles/fixtures'
import { CATALOGUE_BATCH, SEARCH_DEBOUNCE_MS, useCatalogue } from './useCatalogue'

const product = (n: number, over = {}) => productFixture({ productId: `550e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`, name: `Producto ${n}`, ...over })
const batch = (from: number, count: number) => Array.from({ length: count }, (_, i) => product(from + i))
const pageMeta = (page: number, total: number, limit = CATALOGUE_BATCH) => ({ page, limit, total, totalPages: Math.ceil(total / limit) })
const productCalls = () => apiClient.request.mock.calls.filter(([path]) => path === '/api/v1/products')
const lastQuery = () => productCalls().at(-1)![1]!.query as Record<string, unknown>

beforeEach(() => { apiClient.request.mockReset() })

it('carga el primer lote de 24 productos activos sin esperar el debounce', async () => {
  apiClient.request.mockResolvedValue({ data: batch(1, 24), meta: pageMeta(1, 60) })
  const { result } = renderHook(() => useCatalogue())
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  expect(lastQuery()).toEqual({ active: true, page: 1, limit: 24 })
  expect(result.current.products).toHaveLength(24)
  expect(result.current.total).toBe(60)
  expect(result.current.hasMore).toBe(true)
})

it('filtra por nombre en el servidor tras 200 ms, no sobre la página cargada', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    apiClient.request.mockResolvedValue(pageOf([product(1)]))
    const { result } = renderHook(() => useCatalogue())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    apiClient.request.mockClear()
    act(() => { result.current.setName('rat') })
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1) })
    expect(productCalls()).toHaveLength(0)
    await act(async () => { vi.advanceTimersByTime(1) })
    await waitFor(() => expect(productCalls()).toHaveLength(1))
    expect(lastQuery()).toMatchObject({ name: 'rat', active: true, page: 1 })
  } finally { vi.useRealTimers() }
})

it('varias pulsaciones seguidas producen una sola consulta', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    apiClient.request.mockResolvedValue(pageOf([product(1)]))
    const { result } = renderHook(() => useCatalogue())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    apiClient.request.mockClear()
    for (const text of ['r', 'ra', 'rat']) { act(() => { result.current.setName(text) }); act(() => { vi.advanceTimersByTime(50) }) }
    await act(async () => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS) })
    await waitFor(() => expect(productCalls()).toHaveLength(1))
    expect(lastQuery()).toMatchObject({ name: 'rat' })
  } finally { vi.useRealTimers() }
})

it('filtrar por categoría reinicia la lista y consulta esa categoría', async () => {
  apiClient.request.mockResolvedValue(pageOf([product(1)]))
  const { result } = renderHook(() => useCatalogue())
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  act(() => { result.current.setCategoryId(ids.category) })
  await waitFor(() => expect(lastQuery()).toMatchObject({ categoryId: ids.category, page: 1 }))
})

it('una respuesta tardía de una búsqueda anterior nunca reemplaza a la vigente', async () => {
  const slow = deferred<unknown>()
  const fast = deferred<unknown>()
  apiClient.request.mockResolvedValueOnce(pageOf([product(1)]))
  const { result } = renderHook(() => useCatalogue())
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  apiClient.request.mockImplementationOnce(() => slow.promise).mockImplementationOnce(() => fast.promise)
  act(() => { result.current.setCategoryId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') })
  await waitFor(() => expect(productCalls()).toHaveLength(2))
  act(() => { result.current.setCategoryId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') })
  await waitFor(() => expect(productCalls()).toHaveLength(3))
  await act(async () => { fast.resolve(pageOf([product(2, { name: 'Vigente' })])) })
  await act(async () => { slow.resolve(pageOf([product(3, { name: 'Tardía' })])) })
  expect(result.current.products.map((item) => item.name)).toEqual(['Vigente'])
})

it('"mostrar más" agrega el siguiente lote sin duplicar productos', async () => {
  apiClient.request
    .mockResolvedValueOnce({ data: batch(1, 24), meta: pageMeta(1, 30) })
    .mockResolvedValueOnce({ data: batch(20, 11), meta: pageMeta(2, 30) })
  const { result } = renderHook(() => useCatalogue())
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  await act(async () => { result.current.loadMore() })
  await waitFor(() => expect(result.current.products).toHaveLength(30))
  expect(lastQuery()).toMatchObject({ page: 2, limit: 24 })
  expect(new Set(result.current.products.map((item) => item.productId)).size).toBe(30)
  expect(result.current.hasMore).toBe(false)
})

it('un error permite reintentar la misma consulta', async () => {
  apiClient.request.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(pageOf([product(1)]))
  const { result } = renderHook(() => useCatalogue())
  await waitFor(() => expect(result.current.state.status).toBe('error'))
  act(() => { result.current.retry() })
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  expect(result.current.products).toHaveLength(1)
})

it('un resultado vacío se distingue de un error', async () => {
  apiClient.request.mockResolvedValue(pageOf([]))
  const { result } = renderHook(() => useCatalogue())
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  expect(result.current.products).toEqual([])
  expect(result.current.total).toBe(0)
})
