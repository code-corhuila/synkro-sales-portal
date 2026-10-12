import { apiClient } from '../../test-doubles/shellApiClient'
import { ids, sagaFixture } from '../../test-doubles/fixtures'
import { getSaga, startRegisterSale } from './workflowApi'

const request = { customerId: ids.customer, lines: [{ productId: ids.productA, quantity: 2 }] }
const key = '7d444840-9dc0-4f3b-9d5e-d1f0b1d5f0a1'

beforeEach(() => { apiClient.request.mockReset().mockResolvedValue(sagaFixture()) })

describe('startRegisterSale', () => {
  it('usa POST /api/v1/sagas/register-sale con el cuerpo documentado y la clave de idempotencia explícita', async () => {
    const controller = new AbortController()
    const saga = await startRegisterSale(request, { idempotencyKey: key, signal: controller.signal })
    expect(saga).toEqual(sagaFixture())
    expect(apiClient.request).toHaveBeenCalledTimes(1)
    expect(apiClient.request).toHaveBeenCalledWith('/api/v1/sagas/register-sale', {
      method: 'POST', body: request, idempotencyKey: key, signal: controller.signal,
    })
  })
  it('lista blanca: descarta cualquier campo que no sea customerId, productId y quantity', async () => {
    const polluted = {
      customerId: ids.customer, createdBy: ids.user, totalCents: 1, saleId: ids.sale,
      lines: [{ productId: ids.productA, quantity: 2, unitPriceCents: 10, subtotalCents: 20, name: 'x' }],
    }
    await startRegisterSale(polluted as never, { idempotencyKey: key })
    const sent = apiClient.request.mock.calls[0][1]!.body as Record<string, unknown>
    expect(sent).toEqual(request)
    expect(JSON.stringify(sent)).not.toMatch(/createdBy|unitPriceCents|subtotalCents|totalCents|saleId|name/)
  })
  it.each([
    ['sin clave', { ...request }, ''],
    ['cliente no UUID', { ...request, customerId: 'abc' }, key],
    ['sin líneas', { ...request, lines: [] }, key],
    ['101 líneas', { ...request, lines: Array.from({ length: 101 }, () => request.lines[0]) }, key],
    ['cantidad cero', { ...request, lines: [{ productId: ids.productA, quantity: 0 }] }, key],
    ['cantidad fraccionaria', { ...request, lines: [{ productId: ids.productA, quantity: 1.5 }] }, key],
    ['producto no UUID', { ...request, lines: [{ productId: 'p', quantity: 1 }] }, key],
  ])('rechaza %s antes de salir del navegador', async (_name, body, idempotencyKey) => {
    await expect(startRegisterSale(body, { idempotencyKey })).rejects.toThrow()
    expect(apiClient.request).not.toHaveBeenCalled()
  })
  it('propaga el error de transporte sin reintentar por su cuenta', async () => {
    apiClient.request.mockRejectedValue({ status: 0, body: { error: 'TIMEOUT' } })
    await expect(startRegisterSale(request, { idempotencyKey: key })).rejects.toMatchObject({ status: 0 })
    expect(apiClient.request).toHaveBeenCalledTimes(1)
  })
})

describe('getSaga', () => {
  it('lee GET /api/v1/sagas/{id} con cancelación y sin idempotencia ni cuerpo', async () => {
    const controller = new AbortController()
    await getSaga(ids.saga, { signal: controller.signal })
    expect(apiClient.request).toHaveBeenCalledWith(`/api/v1/sagas/${ids.saga}`, { signal: controller.signal })
  })
  it('valida el identificador antes de construir la ruta', async () => {
    await expect(getSaga('../sales')).rejects.toThrow('Identificador inválido')
    expect(apiClient.request).not.toHaveBeenCalled()
  })
})
