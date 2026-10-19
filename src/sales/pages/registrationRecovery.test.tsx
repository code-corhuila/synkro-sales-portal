/* eslint-disable no-restricted-globals -- Tests inspect only the portal's noncredential journal. */
import { act, renderHook } from '@testing-library/react'
import { apiClient } from '../../test-doubles/shellApiClient'
import { notifySession, session } from '../../test-doubles/shellSession'
import { deferred, failure, ids, sagaFixture } from '../../test-doubles/fixtures'
import { useRegisterSale } from './useRegisterSale'

const request = { customerId: ids.customer, lines: [{ productId: ids.productA, quantity: 2 }] }
const posts = () => apiClient.request.mock.calls.filter(([, options]) => options?.method === 'POST')
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  session.sessionId.mockReturnValue('test-session')
  session.user.mockReturnValue({ sub: ids.user, role: 'SALESPERSON' })
  apiClient.request.mockReset().mockRejectedValue(failure(0))
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('recupera una intención incierta tras desmontar sin enviar automáticamente y reutiliza su clave', async () => {
  const first = renderHook(() => useRegisterSale())
  act(() => first.result.current.submit(request))
  await flush()
  const key = posts()[0][1]?.idempotencyKey
  first.unmount()
  const second = renderHook(() => useRegisterSale())
  await flush()
  expect(second.result.current.state).toMatchObject({ phase: 'submit-failed', kind: 'uncertain' })
  expect(posts()).toHaveLength(1)
  act(() => second.result.current.submit(request))
  await flush()
  expect(posts().map(([, options]) => options?.idempotencyKey)).toEqual([key, key])
})

it('guarda antes del POST y recupera saga conocida mediante GET explícito, nunca otro POST', async () => {
  apiClient.request.mockImplementation(async (_path, options) => {
    if (options?.method === 'POST') expect(sessionStorage.length).toBeGreaterThan(0)
    return sagaFixture()
  })
  const first = renderHook(() => useRegisterSale())
  act(() => first.result.current.submit(request))
  await flush()
  first.unmount()
  const second = renderHook(() => useRegisterSale())
  expect(second.result.current.state).toMatchObject({ phase: 'unresolved', sagaId: ids.saga })
  act(() => second.result.current.resume())
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(posts()).toHaveLength(1)
  expect(apiClient.request).toHaveBeenLastCalledWith(`/api/v1/sagas/${ids.saga}`, expect.anything())
})

it('limpiar, cerrar o cambiar líneas no descarta una operación incierta', async () => {
  const { result } = renderHook(() => useRegisterSale())
  act(() => result.current.submit(request))
  await flush()
  act(() => { result.current.clear(); result.current.dismiss() })
  expect(result.current.state.phase).toBe('submit-failed')
  act(() => result.current.submit({ ...request, lines: [{ ...request.lines[0], quantity: 3 }] }))
  await flush()
  expect(posts()).toHaveLength(1)
})

it('una respuesta tardía de otro usuario no se acepta ni modifica la intención recuperable', async () => {
  const slow = deferred()
  apiClient.request.mockReturnValue(slow.promise)
  const done = vi.fn()
  const first = renderHook(() => useRegisterSale({ onCompleted: done }))
  act(() => first.result.current.submit(request))
  session.user.mockReturnValue({ sub: 'other-user', role: 'ADMIN' })
  slow.resolve(sagaFixture({ status: 'COMPLETED', saleId: ids.sale }))
  await flush()
  expect(done).not.toHaveBeenCalled()
  first.unmount()
  const second = renderHook(() => useRegisterSale())
  expect(second.result.current.state.phase).toBe('idle')
})

it('almacenamiento bloqueado impide iniciar un POST que no podrá recuperarse', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
  const { result } = renderHook(() => useRegisterSale())
  act(() => result.current.submit(request))
  await flush()
  expect(posts()).toHaveLength(0)
  expect(result.current.blockedReason).toMatch(/guardar/)
})

it('una intención expirada no se convierte silenciosamente en una venta nueva', async () => {
  const first = renderHook(() => useRegisterSale())
  act(() => first.result.current.submit(request))
  await flush()
  first.unmount()
  vi.setSystemTime(Date.now() + 48 * 3600_000)
  const second = renderHook(() => useRegisterSale())
  act(() => second.result.current.submit(request))
  await flush()
  expect(posts()).toHaveLength(1)
  expect(second.result.current.blockedReason).toMatch(/venció/)
})

it('la misma persona en una sesión nueva no recupera la intención anterior', async () => {
  const first = renderHook(() => useRegisterSale())
  act(() => first.result.current.submit(request))
  await flush()
  first.unmount()
  session.sessionId.mockReturnValue('new-session')
  const second = renderHook(() => useRegisterSale())
  expect(second.result.current.state.phase).toBe('idle')
  expect(sessionStorage.length).toBe(0)
})

it('logout notificado limpia referencias y cancela observación, sin cancelar la saga del backend', async () => {
  apiClient.request.mockResolvedValue(sagaFixture())
  const { result } = renderHook(() => useRegisterSale())
  act(() => result.current.submit(request))
  await flush()
  session.user.mockReturnValue(null)
  session.sessionId.mockReturnValue(null)
  act(() => notifySession())
  expect(result.current.state.phase).toBe('idle')
  expect(sessionStorage.length).toBe(0)
  await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
  expect(apiClient.request).toHaveBeenCalledTimes(1)
})

it('sin contrato de sesión no inicia un registro imposible de aislar de forma segura', async () => {
  session.sessionId.mockReturnValue(null)
  const { result } = renderHook(() => useRegisterSale())
  act(() => result.current.submit(request))
  await flush()
  expect(posts()).toHaveLength(0)
  expect(result.current.blockedReason).toMatch(/versión de SynkroTech/)
})

it('ocultar el historial al navegar detiene la observación y conserva la saga para consulta explícita', async () => {
  apiClient.request.mockResolvedValue(sagaFixture())
  const view = renderHook(({ active }) => useRegisterSale({ active }), { initialProps: { active: true } })
  act(() => view.result.current.submit(request))
  await flush()
  view.rerender({ active: false })
  await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
  expect(apiClient.request).toHaveBeenCalledTimes(1)
  expect(view.result.current.state).toMatchObject({ phase: 'unresolved', sagaId: ids.saga })
  view.rerender({ active: true })
  await flush()
  expect(apiClient.request).toHaveBeenCalledTimes(1)
})
