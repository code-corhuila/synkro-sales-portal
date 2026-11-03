import { apiClient } from '../../test-doubles/shellApiClient'
import { REPORT_ENDPOINTS, listReport } from './reportsApi'

const empty = { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }
beforeEach(() => { apiClient.request.mockReset().mockResolvedValue(empty) })

describe('listReport', () => {
  it('usa exactamente los tres endpoints del contrato de Sales', () => {
    expect(REPORT_ENDPOINTS).toEqual({
      daily: '/api/v1/sales/reports/daily',
      monthly: '/api/v1/sales/reports/monthly',
      'top-products': '/api/v1/sales/reports/top-products',
    })
  })
  it.each(['daily', 'monthly', 'top-products'] as const)('pide %s por el cliente del Host con page, limit y fechas inclusivas', async (kind) => {
    const controller = new AbortController()
    await listReport(kind, { page: 2, from: '2026-09-01', to: '2026-09-30' }, { signal: controller.signal })
    expect(apiClient.request).toHaveBeenCalledWith(REPORT_ENDPOINTS[kind], {
      query: { page: 2, limit: 20, from: '2026-09-01', to: '2026-09-30' }, signal: controller.signal,
    })
  })
  it('omite filtros vacíos o en blanco: la API responde 400 a parámetros vacíos', async () => {
    await listReport('daily', { from: ' ', to: '' })
    expect(apiClient.request.mock.calls[0][1]?.query).toEqual({ page: 1, limit: 20 })
  })
  it('permite un límite menor para el resumen del panel y nunca uno fuera de 1..100', async () => {
    await listReport('top-products', { limit: 3 })
    expect(apiClient.request.mock.calls[0][1]?.query).toEqual({ page: 1, limit: 3 })
    for (const limit of [0, 101, 1.5, NaN]) await expect(listReport('daily', { limit })).rejects.toThrow()
    expect(apiClient.request).toHaveBeenCalledTimes(1)
  })
  it('no deja pasar propiedad, vendedor ni parámetros desconocidos', async () => {
    await listReport('daily', { from: '2026-09-01', createdBy: 'otro', customerId: 'x', userId: 'y' } as never)
    expect(Object.keys(apiClient.request.mock.calls[0][1]?.query ?? {}).sort()).toEqual(['from', 'limit', 'page'])
  })
  it.each([
    [{ from: '2026-02-30' }], [{ to: 'mañana' }], [{ from: '2026-10-02', to: '2026-10-01' }], [{ page: 0 }], [{ page: 1.5 }],
  ])('rechaza %j antes de tocar la red', async (query) => {
    await expect(listReport('monthly', query)).rejects.toThrow('Consulta de reporte inválida')
    expect(apiClient.request).not.toHaveBeenCalled()
  })
  it('acepta from igual a to (un solo día UTC)', async () => {
    await listReport('daily', { from: '2026-10-01', to: '2026-10-01' })
    expect(apiClient.request.mock.calls[0][1]?.query).toMatchObject({ from: '2026-10-01', to: '2026-10-01' })
  })
})
