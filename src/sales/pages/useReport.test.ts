import { act, renderHook, waitFor } from '@testing-library/react'
import { apiClient } from '../../test-doubles/shellApiClient'
import { deferred, failure } from '../../test-doubles/fixtures'
import { useReport } from './useReport'

const answer = (page: number, totalPages = 3, label = 'x') => ({ data: [{ label }], meta: { page, limit: 20, total: 41, totalPages } })
beforeEach(() => { apiClient.request.mockReset().mockImplementation((_path, options) => Promise.resolve(answer(Number(options?.query?.page)))) })

it('empieza cargando y publica los datos con su metadata', async () => {
  const { result } = renderHook(() => useReport('daily'))
  expect(result.current.state.status).toBe('loading')
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  expect(apiClient.request.mock.calls[0][0]).toBe('/api/v1/sales/reports/daily')
})

it('cancela la consulta anterior al cambiar de filtro y descarta su respuesta tardía', async () => {
  const slow = deferred(); const fast = deferred()
  apiClient.request.mockReset().mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise)
  const { result } = renderHook(() => useReport('daily'))
  const firstSignal = apiClient.request.mock.calls[0][1]?.signal as AbortSignal
  act(() => result.current.applyFilters({ from: '2026-10-01', to: '2026-10-31' }))
  expect(firstSignal.aborted).toBe(true)
  await act(async () => { fast.resolve(answer(1, 1, 'nuevo')) })
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  // El cliente ignora el abort y entrega la respuesta vieja después: no puede pisar el filtro actual.
  await act(async () => { slow.resolve(answer(1, 1, 'viejo')) })
  expect(result.current.state).toMatchObject({ status: 'ready', value: { data: [{ label: 'nuevo' }] } })
  expect(result.current.query).toMatchObject({ from: '2026-10-01', to: '2026-10-31' })
})

it('un error tardío de una consulta reemplazada no sustituye los datos vigentes', async () => {
  const slow = deferred(); const fast = deferred()
  apiClient.request.mockReset().mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise)
  const { result } = renderHook(() => useReport('monthly'))
  act(() => result.current.applyFilters({ from: '2026-01-01' }))
  await act(async () => { fast.resolve(answer(1, 1)) })
  await act(async () => { slow.reject(failure(500)) })
  expect(result.current.state.status).toBe('ready')
})

it('cambiar de reporte aborta el anterior, vuelve a cargar y no mezcla respuestas', async () => {
  const daily = deferred()
  apiClient.request.mockReset().mockReturnValueOnce(daily.promise).mockResolvedValueOnce(answer(1, 1, 'mes'))
  const { result, rerender } = renderHook(({ kind }) => useReport(kind), { initialProps: { kind: 'daily' as 'daily' | 'monthly' } })
  const signal = apiClient.request.mock.calls[0][1]?.signal as AbortSignal
  rerender({ kind: 'monthly' })
  expect(signal.aborted).toBe(true)
  await waitFor(() => expect(result.current.state).toMatchObject({ status: 'ready', value: { data: [{ label: 'mes' }] } }))
  await act(async () => { daily.resolve(answer(1, 1, 'dia')) })
  expect(result.current.state).toMatchObject({ value: { data: [{ label: 'mes' }] } })
  expect(apiClient.request.mock.calls[1][0]).toBe('/api/v1/sales/reports/monthly')
})

it('desmontar aborta la consulta en vuelo', () => {
  apiClient.request.mockReset().mockReturnValue(new Promise(() => {}))
  const { unmount } = renderHook(() => useReport('top-products'))
  const signal = apiClient.request.mock.calls[0][1]?.signal as AbortSignal
  unmount()
  expect(signal.aborted).toBe(true)
})

it('reintentar repite la misma consulta tras un error', async () => {
  apiClient.request.mockReset().mockRejectedValueOnce(failure(0, 'NETWORK_ERROR')).mockResolvedValueOnce(answer(1, 1))
  const { result } = renderHook(() => useReport('daily'))
  await waitFor(() => expect(result.current.state.status).toBe('error'))
  act(() => result.current.retry())
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  expect(apiClient.request.mock.calls[1][1]?.query).toEqual(apiClient.request.mock.calls[0][1]?.query)
})

it('rechaza páginas inválidas y corrige una página que desaparece sin pedir la página cero', async () => {
  const { result } = renderHook(() => useReport('daily'))
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  for (const page of [0, -1, 1.5, NaN, 4, 1]) act(() => result.current.goToPage(page))
  expect(apiClient.request).toHaveBeenCalledTimes(1)
  act(() => result.current.goToPage(3))
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  apiClient.request.mockImplementation((_path, options) => Promise.resolve(answer(Number(options?.query?.page), 0)))
  act(() => result.current.retry())
  await waitFor(() => expect(result.current.query.page).toBe(1))
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  expect(apiClient.request.mock.calls.map(([, options]) => options?.query?.page)).toEqual([1, 3, 3, 1])
})

it('con enabled=false no pide nada (rol sin permiso)', () => {
  renderHook(() => useReport('daily', { enabled: false }))
  expect(apiClient.request).not.toHaveBeenCalled()
})
