import { renderHook, waitFor } from '@testing-library/react'
import { apiClient } from '../../test-doubles/shellApiClient'
import { customerFixture, deferred, failure } from '../../test-doubles/fixtures'
import { CUSTOMER_LOOKUP_CONCURRENCY, useCustomerLabels } from './useCustomerLabels'

const id = (n: number) => `550e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`
const customers = (path: string) => customerFixture({ customerId: path.split('/').pop(), name: `Cliente ${path.split('/').pop()!.slice(-3)}`, identityDocument: `10${path.slice(-3)}` })

beforeEach(() => { apiClient.request.mockReset() })

it('consulta una sola vez cada cliente repetido y muestra nombre y documento', async () => {
  apiClient.request.mockImplementation(async (path) => customers(path))
  const { result } = renderHook(() => useCustomerLabels([id(1), id(2), id(1), id(1), id(2)]))
  await waitFor(() => expect(result.current.get(id(1))?.status).toBe('ready'))
  await waitFor(() => expect(result.current.get(id(2))?.status).toBe('ready'))
  expect(apiClient.request).toHaveBeenCalledTimes(2)
  const label = result.current.get(id(1))
  expect(label).toMatchObject({ status: 'ready', name: expect.stringContaining('Cliente'), document: expect.stringMatching(/^10/) })
})

it('no repite las consultas cuando cambia la lista pero el cliente ya se conoce', async () => {
  apiClient.request.mockImplementation(async (path) => customers(path))
  const { result, rerender } = renderHook(({ ids }) => useCustomerLabels(ids), { initialProps: { ids: [id(1)] } })
  await waitFor(() => expect(result.current.get(id(1))?.status).toBe('ready'))
  rerender({ ids: [id(1), id(2)] })
  await waitFor(() => expect(result.current.get(id(2))?.status).toBe('ready'))
  expect(apiClient.request).toHaveBeenCalledTimes(2)
})

it('limita la concurrencia de las consultas', async () => {
  let inFlight = 0
  let peak = 0
  const gates: Array<() => void> = []
  apiClient.request.mockImplementation((path) => new Promise((resolve) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    gates.push(() => { inFlight -= 1; resolve(customers(path)) })
  }))
  const ids = Array.from({ length: 12 }, (_, i) => id(i + 1))
  const { result } = renderHook(() => useCustomerLabels(ids))
  await waitFor(() => expect(gates.length).toBeGreaterThan(0))
  while (result.current.get(ids[11])?.status !== 'ready') {
    gates.splice(0).forEach((open) => open())
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  expect(peak).toBeLessThanOrEqual(CUSTOMER_LOOKUP_CONCURRENCY)
  expect(apiClient.request).toHaveBeenCalledTimes(12)
})

it('un cliente que no se puede leer queda como no disponible sin inventar datos ni afectar a los demás', async () => {
  apiClient.request.mockImplementation(async (path) => {
    if (path.endsWith(id(2))) throw failure(404, 'NOT_FOUND')
    return customers(path)
  })
  const { result } = renderHook(() => useCustomerLabels([id(1), id(2)]))
  await waitFor(() => expect(result.current.get(id(2))?.status).toBe('unavailable'))
  await waitFor(() => expect(result.current.get(id(1))?.status).toBe('ready'))
  expect(result.current.get(id(2))).toEqual({ status: 'unavailable' })
})

it('mientras llega la respuesta el cliente figura como cargando', async () => {
  const slow = deferred<unknown>()
  apiClient.request.mockReturnValue(slow.promise)
  const { result } = renderHook(() => useCustomerLabels([id(1)]))
  expect(result.current.get(id(1))).toEqual({ status: 'loading' })
  slow.resolve(customerFixture())
})

it('cancela las consultas pendientes al desmontar', async () => {
  const signals: AbortSignal[] = []
  apiClient.request.mockImplementation((_path, options) => { signals.push(options!.signal!); return new Promise(() => {}) })
  const { unmount } = renderHook(() => useCustomerLabels([id(1), id(2)]))
  await waitFor(() => expect(signals.length).toBe(2))
  unmount()
  expect(signals.every((signal) => signal.aborted)).toBe(true)
})
