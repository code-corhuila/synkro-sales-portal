import { act, renderHook, waitFor } from '@testing-library/react'
import { apiClient } from '../../test-doubles/shellApiClient'
import { useSalesHistory } from './useSalesHistory'

const answer = (page: number, totalPages = 3) => ({ data: [], meta: { page, limit: 20, total: 41, totalPages } })
beforeEach(() => { apiClient.request.mockReset().mockImplementation((_path, options) => Promise.resolve(answer(Number(options?.query?.page)))) })
it('rechaza páginas inválidas, iguales o superiores al total, incluso mientras carga', async () => {
  const { result } = renderHook(() => useSalesHistory())
  act(() => result.current.goToPage(2))
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  for (const page of [0, -1, 1.5, Infinity, NaN, 4, 1]) act(() => result.current.goToPage(page))
  expect(apiClient.request).toHaveBeenCalledTimes(1)
})
it('corrige una página que desaparece después de una recarga sin solicitar página cero', async () => {
  const { result } = renderHook(() => useSalesHistory())
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  act(() => result.current.goToPage(3))
  await waitFor(() => expect(result.current.query.page).toBe(3))
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  apiClient.request.mockImplementation((_path, options) => Promise.resolve(answer(Number(options?.query?.page), 0)))
  act(() => result.current.retry())
  await waitFor(() => expect(result.current.query.page).toBe(1))
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  expect(apiClient.request.mock.calls.map(([, options]) => options?.query?.page)).toEqual([1, 3, 3, 1])
})
