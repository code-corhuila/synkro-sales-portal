import { apiClient } from '../../test-doubles/shellApiClient'
import { ids, saleFixture } from '../../test-doubles/fixtures'
import { getSale, listSales } from './salesApi'

const page = { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }
beforeEach(() => { apiClient.request.mockReset().mockResolvedValue(page) })

it('usa solo el cliente compartido, ruta GET y paginación predeterminada', async () => {
  const direct = vi.spyOn(globalThis, 'fetch')
  expect(await listSales()).toBe(page)
  expect(apiClient.request).toHaveBeenCalledExactlyOnceWith('/api/v1/sales', { query: { page: 1, limit: 20 }, signal: undefined })
  expect(direct).not.toHaveBeenCalled()
  direct.mockRestore()
})
it('serializa solo filtros reconocidos y conserva signal, data y meta', async () => {
  const signal = new AbortController().signal
  const filters = { page: 3, from: '2026-09-01', to: '2026-09-30', customerId: ' 12345678-1234-4234-8234-123456789abc ', createdBy: 'ignored', limit: 100 }
  expect(await listSales(filters, { signal })).toBe(page)
  expect(apiClient.request).toHaveBeenCalledExactlyOnceWith('/api/v1/sales', {
    query: { page: 3, limit: 20, from: '2026-09-01', to: '2026-09-30', customerId: filters.customerId.trim() }, signal,
  })
})
it('omite los filtros vacíos', async () => {
  await listSales({ from: '', to: ' ', customerId: ' ' })
  expect(apiClient.request.mock.lastCall?.[1]?.query).toEqual({ page: 1, limit: 20 })
})
it.each([0, -1, 1.5, NaN, Infinity])('rechaza página inválida %s antes del transporte', async (pageNumber) => {
  await expect(listSales({ page: pageNumber })).rejects.toThrow()
  expect(apiClient.request).not.toHaveBeenCalled()
})
it.each([
  { from: '2026-02-30' }, { to: '2026-13-01' }, { from: '2026-9-01' },
  { from: '2026-10-01', to: '2026-09-01' }, { customerId: 'not-a-uuid' },
])('rechaza filtros inválidos %j', async (filters) => {
  await expect(listSales(filters)).rejects.toThrow()
  expect(apiClient.request).not.toHaveBeenCalled()
})
it('preserva el error del host', async () => {
  const failure = { status: 403, body: { error: 'FORBIDDEN', traceId: 'reference' } }
  apiClient.request.mockRejectedValue(failure)
  await expect(listSales()).rejects.toBe(failure)
})

describe('getSale', () => {
  it('lee GET /api/v1/sales/{id} con el cliente compartido y cancelación, sin escribir nada', async () => {
    apiClient.request.mockResolvedValue(saleFixture())
    const controller = new AbortController()
    expect(await getSale(ids.sale, { signal: controller.signal })).toEqual(saleFixture())
    expect(apiClient.request).toHaveBeenCalledExactlyOnceWith('/api/v1/sales/' + ids.sale, { signal: controller.signal })
  })
  it('rechaza un identificador que no es UUID antes de construir la ruta', async () => {
    await expect(getSale('../reports/daily')).rejects.toThrow('Identificador inválido')
    expect(apiClient.request).not.toHaveBeenCalled()
  })
})
