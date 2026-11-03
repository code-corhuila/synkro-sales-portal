import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { apiClient } from '../../test-doubles/shellApiClient'
import { session } from '../../test-doubles/shellSession'
import { failure, ids, productFixture } from '../../test-doubles/fixtures'
import DashboardSummary from './DashboardSummary'

const meta = (total = 1) => ({ page: 1, limit: 1, total, totalPages: total })
const answers: Record<string, unknown> = {
  daily: { data: [{ day: '2026-10-12', dailyTotalCents: 123456789, saleCount: 3 }], meta: meta() },
  monthly: { data: [{ month: '2026-10-01', monthlyTotalCents: 99900, saleCount: 7 }], meta: meta() },
  top: { data: [{ productId: ids.productA, totalQuantity: 12, totalRevenueCents: 150600 }], meta: meta() },
}
const kindOf = (path: string) => path.endsWith('/daily') ? 'daily' : path.endsWith('/monthly') ? 'monthly' : 'top'
beforeEach(() => {
  session.user.mockReset().mockReturnValue({ sub: 'identity', role: 'ADMIN' })
  apiClient.request.mockReset().mockImplementation(async (path) => {
    if (path.includes('/reports/')) return answers[kindOf(path)]
    if (path === `/api/v1/products/${ids.productA}`) return productFixture()
    throw failure(404)
  })
})
const reportCalls = () => apiClient.request.mock.calls.filter(([path]) => path.includes('/reports/'))

it('muestra tres resúmenes reales con límite mínimo, sin filtros y sin totales inventados', async () => {
  render(<DashboardSummary />)
  const daily = await screen.findByRole('region', { name: 'Último día con ventas' })
  expect(within(daily).getByText(/1\.234\.567,89/)).toBeVisible()
  expect(within(daily).getByText(/12.*oct.*2026/i)).toBeVisible()
  expect(within(daily).getByText(/3 ventas/)).toBeVisible()
  const monthly = await screen.findByRole('region', { name: 'Mes más reciente' })
  expect(within(monthly).getByText(/999,00/)).toBeVisible()
  expect(within(monthly).getByText(/7 ventas/)).toBeVisible()
  const top = await screen.findByRole('region', { name: 'Productos más vendidos' })
  expect(await within(top).findByText('Teclado mecánico')).toBeVisible()
  expect(within(top).getByText(/12 unidades/)).toBeVisible()
  expect(reportCalls().map(([path, options]) => [path, options?.query])).toEqual([
    ['/api/v1/sales/reports/daily', { page: 1, limit: 1 }],
    ['/api/v1/sales/reports/monthly', { page: 1, limit: 1 }],
    ['/api/v1/sales/reports/top-products', { page: 1, limit: 3 }],
  ])
  expect(screen.queryByText(/beneficio|ganancia|usuarios|existencias/i)).toBeNull()
})

it('cada resumen enlaza a su reporte completo con rutas del portal', async () => {
  render(<DashboardSummary />)
  await screen.findByRole('region', { name: 'Último día con ventas' })
  expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
    '/sales/reports/daily', '/sales/reports/monthly', '/sales/reports/top-products',
  ])
})

it('SALESPERSON ve “Tu contribución”; ADMIN no', async () => {
  session.user.mockReturnValue({ sub: 'vendedor', role: 'SALESPERSON' })
  const { unmount } = render(<DashboardSummary />)
  expect(screen.getByRole('heading', { name: 'Tu contribución' })).toBeVisible()
  await screen.findByRole('region', { name: 'Último día con ventas' })
  unmount()
  session.user.mockReturnValue({ sub: 'admin', role: 'ADMIN' })
  render(<DashboardSummary />)
  expect(screen.queryByRole('heading', { name: 'Tu contribución' })).toBeNull()
  expect(screen.getByRole('heading', { name: 'Resumen de ventas' })).toBeVisible()
})

it('un resumen vacío lo dice sin inventar ceros', async () => {
  apiClient.request.mockImplementation(async () => ({ data: [], meta: { page: 1, limit: 1, total: 0, totalPages: 0 } }))
  render(<DashboardSummary />)
  expect((await screen.findAllByText('Todavía no hay ventas registradas.')).length).toBe(3)
  expect(screen.queryByText(/\$\s?0/)).toBeNull()
})

it('si un endpoint falla, los otros resúmenes siguen visibles y solo ese ofrece reintento', async () => {
  const user = userEvent.setup()
  apiClient.request.mockImplementation(async (path) => {
    if (path.endsWith('/monthly')) throw failure(500)
    if (path.includes('/reports/')) return answers[kindOf(path)]
    return productFixture()
  })
  render(<DashboardSummary />)
  const monthly = await screen.findByRole('region', { name: 'Mes más reciente' })
  expect(await within(monthly).findByRole('alert')).toHaveTextContent('No se pudo cargar este resumen.')
  expect(within(await screen.findByRole('region', { name: 'Último día con ventas' })).getByText(/1\.234\.567,89/)).toBeVisible()
  apiClient.request.mockImplementation(async (path) => path.includes('/reports/') ? answers[kindOf(path)] : productFixture())
  await user.click(within(monthly).getByRole('button', { name: 'Reintentar' }))
  expect(await within(monthly).findByText(/999,00/)).toBeVisible()
})

it('403 muestra el permiso y no ofrece reintento; INVENTORY no dispara solicitudes', async () => {
  apiClient.request.mockRejectedValue(failure(403))
  const { unmount } = render(<DashboardSummary />)
  expect((await screen.findAllByText('No tienes permiso para consultar los reportes de ventas.')).length).toBeGreaterThan(0)
  expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  unmount()
  apiClient.request.mockReset()
  session.user.mockReturnValue({ sub: 'x', role: 'INVENTORY' })
  const { container } = render(<DashboardSummary />)
  expect(container).toBeEmptyDOMElement()
  expect(apiClient.request).not.toHaveBeenCalled()
})
