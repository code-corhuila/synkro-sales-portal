import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { navigateTo, redirectToSales } from './navigation'
import { apiClient } from './test-doubles/shellApiClient'
import { session } from './test-doubles/shellSession'
import { customerFixture, failure, ids, pageOf, productFixture, saleFixture } from './test-doubles/fixtures'

const other = '550e8400-e29b-41d4-a716-446655440777'
const detailPath = `/sales/${ids.sale}`
const calls = (prefix: string) => apiClient.request.mock.calls.filter(([path]) => path === prefix || path.startsWith(`${prefix}/`)).length
const popstate = () => new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }))

beforeEach(() => {
  session.user.mockReset().mockReturnValue({ sub: ids.user, role: 'SALESPERSON' })
  apiClient.request.mockReset().mockImplementation((path, options) => {
    if (path === '/api/v1/sales') return Promise.resolve({ data: [saleFixture()], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    if (path === `/api/v1/sales/${ids.sale}`) return Promise.resolve(saleFixture())
    if (path === `/api/v1/sales/${other}`) return Promise.resolve(saleFixture({ saleId: other }))
    if (path.startsWith('/api/v1/customers')) return Promise.resolve(options?.query ? pageOf([customerFixture()]) : customerFixture())
    if (path.startsWith('/api/v1/products')) return Promise.resolve(productFixture())
    return Promise.reject(failure(404))
  })
  window.history.replaceState(null, '', '/sales')
})
afterEach(() => window.history.replaceState(null, '', '/'))

it('/sales → detalle → /sales conserva el borrador del formulario y los filtros del historial', async () => {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByRole('link', { name: `Ver venta ${ids.sale}` })
  await user.type(screen.getByLabelText('Documento del cliente'), '1075')
  await user.type(screen.getByLabelText('ID del cliente'), ids.customer)
  await user.click(screen.getByRole('link', { name: `Ver venta ${ids.sale}` }))
  expect(await screen.findByRole('heading', { name: 'Detalle de venta' })).toBeVisible()
  expect(screen.getByLabelText('Documento del cliente').closest('[hidden]')).not.toBeNull()
  await user.click(screen.getByRole('link', { name: 'Volver al historial' }))
  expect(await screen.findByRole('heading', { name: 'Ventas' })).toBeVisible()
  expect(screen.getByLabelText('Documento del cliente')).toHaveValue('1075')
  expect(screen.getByLabelText('ID del cliente')).toHaveValue(ids.customer)
})

it('Atrás y Adelante del navegador alternan historial y detalle conservando el borrador', async () => {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByRole('link', { name: `Ver venta ${ids.sale}` })
  await user.type(screen.getByLabelText('Documento del cliente'), '99')
  await user.click(screen.getByRole('link', { name: `Ver venta ${ids.sale}` }))
  await screen.findByRole('heading', { name: 'Detalle de venta' })
  const back = popstate()
  act(() => { window.history.back() })
  await back
  expect(await screen.findByRole('heading', { name: 'Ventas' })).toBeVisible()
  expect(screen.getByLabelText('Documento del cliente')).toHaveValue('99')
  const forward = popstate()
  act(() => { window.history.forward() })
  await forward
  expect(await screen.findByRole('heading', { name: 'Detalle de venta' })).toBeVisible()
  expect(window.location.pathname).toBe(detailPath)
})

it('no vuelve a pedir datos ni remonta al volver al historial, y el detalle se pide una vez', async () => {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByRole('link', { name: `Ver venta ${ids.sale}` })
  const field = screen.getByLabelText('Documento del cliente')
  expect(calls('/api/v1/sales')).toBe(1)
  await user.click(screen.getByRole('link', { name: `Ver venta ${ids.sale}` }))
  await screen.findByText('Ana Pérez')
  expect(calls(`/api/v1/sales/${ids.sale}`)).toBe(1)
  await user.click(screen.getByRole('link', { name: 'Volver al historial' }))
  await screen.findByRole('heading', { name: 'Ventas' })
  expect(screen.getByLabelText('Documento del cliente')).toBe(field)
  expect(apiClient.request.mock.calls.filter(([path]) => path === '/api/v1/sales').length).toBe(1)
})

it('un popstate con la misma ruta no remonta ni consulta de nuevo', async () => {
  render(<App />)
  const field = await screen.findByLabelText('Documento del cliente')
  await screen.findByRole('link', { name: `Ver venta ${ids.sale}` })
  const before = apiClient.request.mock.calls.length
  act(() => { window.dispatchEvent(new PopStateEvent('popstate')); window.dispatchEvent(new PopStateEvent('popstate')) })
  expect(screen.getByLabelText('Documento del cliente')).toBe(field)
  expect(apiClient.request.mock.calls.length).toBe(before)
})

it('navigateTo y el enlace emiten un solo popstate y no duplican entradas', async () => {
  const listener = vi.fn()
  render(<App />)
  await screen.findByRole('link', { name: `Ver venta ${ids.sale}` })
  window.addEventListener('popstate', listener)
  const length = window.history.length
  await userEvent.setup().click(screen.getByRole('link', { name: `Ver venta ${ids.sale}` }))
  act(() => navigateTo(detailPath))
  window.removeEventListener('popstate', listener)
  expect(listener).toHaveBeenCalledTimes(1)
  expect(window.history.length).toBe(length + 1)
})

it('el remoto registra dos oyentes de popstate (ruta y aviso) y los retira y lo retira al desmontar', () => {
  const add = vi.spyOn(window, 'addEventListener')
  const remove = vi.spyOn(window, 'removeEventListener')
  const { unmount } = render(<App />)
  expect(add.mock.calls.filter(([type]) => type === 'popstate')).toHaveLength(2)
  unmount()
  expect(remove.mock.calls.filter(([type]) => type === 'popstate')).toHaveLength(2)
  add.mockRestore()
  remove.mockRestore()
})

it('entre dos ventas nunca queda contenido de la anterior', async () => {
  window.history.replaceState(null, '', detailPath)
  render(<App />)
  expect(await screen.findByText(ids.sale)).toBeVisible()
  act(() => navigateTo(`/sales/${other}`))
  expect(await screen.findByText(other)).toBeVisible()
  expect(screen.queryByText(ids.sale)).toBeNull()
})

it('navegación entre portales: otra ruta desmonta Sales y deja de consultar; volver monta limpio', async () => {
  render(<App />)
  await screen.findByRole('link', { name: `Ver venta ${ids.sale}` })
  act(() => navigateTo('/products'))
  expect(screen.queryByRole('heading', { name: 'Ventas' })).toBeNull()
  const before = apiClient.request.mock.calls.length
  act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })
  expect(apiClient.request.mock.calls.length).toBe(before)
  act(() => navigateTo('/sales'))
  expect(await screen.findByRole('heading', { name: 'Ventas' })).toBeVisible()
})

it('un 403 desde el detalle vuelve al historial con el aviso, aunque el historial ya estuviera montado', async () => {
  apiClient.request.mockImplementation((path) => path === `/api/v1/sales/${other}` ? Promise.reject(failure(403, 'FORBIDDEN')) : Promise.resolve(path === '/api/v1/sales' ? { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } } : saleFixture()))
  render(<App />)
  await screen.findByRole('heading', { name: 'Ventas' })
  act(() => navigateTo(`/sales/${other}`))
  await waitFor(() => expect(window.location.pathname).toBe('/sales'))
  expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para ver esa venta')
  expect(window.history.state?.synkroSalesNotice).toBeUndefined()
  void redirectToSales
})
