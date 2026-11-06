import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { apiClient } from '../../test-doubles/shellApiClient'
import { session } from '../../test-doubles/shellSession'
import { deferred, failure, ids, productFixture } from '../../test-doubles/fixtures'
import { DashboardTrend } from './DashboardTrend'

const meta = (overrides = {}) => ({ page: 1, limit: 20, total: 2, totalPages: 1, ...overrides })
const daily = (overrides = {}) => ({
  data: [{ day: '2026-10-12', dailyTotalCents: 123456789, saleCount: 3 }, { day: '2026-10-11', dailyTotalCents: 500, saleCount: 1 }],
  meta: meta(overrides),
})
const monthly = (overrides = {}) => ({ data: [{ month: '2026-10-01', monthlyTotalCents: 99900, saleCount: 7 }], meta: meta({ total: 1, ...overrides }) })
const top = (overrides = {}) => ({
  data: [{ productId: ids.productA, totalQuantity: 12, totalRevenueCents: 150600 }, { productId: ids.productB, totalQuantity: 4, totalRevenueCents: 400 }],
  meta: meta({ limit: 5, ...overrides }),
})
function mockReports(overrides: { daily?: typeof daily; monthly?: typeof monthly; 'top-products'?: typeof top } = {}) {
  apiClient.request.mockImplementation(async (path) => {
    if (path.endsWith('/daily')) return (overrides.daily ?? daily)()
    if (path.endsWith('/monthly')) return (overrides.monthly ?? monthly)()
    if (path.endsWith('/top-products')) return (overrides['top-products'] ?? top)()
    if (path === `/api/v1/products/${ids.productA}`) return productFixture()
    throw failure(404)
  })
}
const reportCalls = () => apiClient.request.mock.calls.filter(([path]) => path.includes('/reports/'))
const calls = (suffix: string) => reportCalls().filter(([path]) => path.endsWith(suffix))

beforeEach(() => {
  session.user.mockReset().mockReturnValue({ sub: 'identity', role: 'ADMIN' })
  apiClient.request.mockReset()
  mockReports()
})

describe('datos', () => {
  it('dibuja un bar por fila del día y de los productos más vendidos, con su tabla reusada', async () => {
    render(<DashboardTrend />)
    const seriesTable = await screen.findByRole('table', { name: 'Totales diarios de ventas' })
    expect(within(seriesTable).getByText(/1\.234\.567,89/)).toBeVisible()
    const topTable = await screen.findByRole('table', { name: 'Productos más vendidos' })
    expect(await within(topTable).findByText('Teclado mecánico')).toBeVisible()
    const charts = document.querySelectorAll('svg')
    expect(charts[0].querySelectorAll('rect')).toHaveLength(2)
    expect(charts[1].querySelectorAll('rect')).toHaveLength(2)
  })
  it('una sola página dice el total exacto, sin inventar que hay más', async () => {
    render(<DashboardTrend />)
    await screen.findByRole('table', { name: 'Totales diarios de ventas' })
    expect(screen.getByText('Mostrando 2 días del rango seleccionado.')).toBeVisible()
  })
  it('una página parcial dice "N de M", nunca el total como si fuera lo mostrado', async () => {
    mockReports({ daily: () => daily({ total: 45, totalPages: 3 }) })
    render(<DashboardTrend />)
    await screen.findByRole('table', { name: 'Totales diarios de ventas' })
    expect(screen.getByText('Mostrando 2 de 45 días del rango seleccionado.')).toBeVisible()
    expect(screen.getByRole('navigation', { name: 'Paginación de la tendencia' })).toHaveTextContent('Página 1 de 3 · 45 días · 20 por página')
  })
})

describe('rango compartido', () => {
  it('aplicar un rango consulta diario y productos más vendidos con el mismo from/to y vuelve a la página 1', async () => {
    const user = userEvent.setup()
    render(<DashboardTrend />)
    await screen.findByRole('table', { name: 'Totales diarios de ventas' })
    await user.type(screen.getByLabelText('Desde'), '2026-10-01')
    await user.type(screen.getByLabelText('Hasta'), '2026-10-31')
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    await screen.findByRole('table', { name: 'Totales diarios de ventas' })
    expect(calls('/daily').at(-1)?.[1]?.query).toEqual({ page: 1, limit: 20, from: '2026-10-01', to: '2026-10-31' })
    expect(calls('/top-products').at(-1)?.[1]?.query).toEqual({ page: 1, limit: 5, from: '2026-10-01', to: '2026-10-31' })
  })
  it('limpiar el rango vuelve a consultar ambos sin fechas', async () => {
    const user = userEvent.setup()
    render(<DashboardTrend />)
    await screen.findByRole('table', { name: 'Totales diarios de ventas' })
    await user.type(screen.getByLabelText('Desde'), '2026-10-01')
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    await screen.findByRole('table', { name: 'Totales diarios de ventas' })
    expect(calls('/daily').at(-1)?.[1]?.query).toEqual({ page: 1, limit: 20 })
    expect(calls('/top-products').at(-1)?.[1]?.query).toEqual({ page: 1, limit: 5 })
  })
  it('un rango invertido se explica y no llama a la API', async () => {
    const user = userEvent.setup()
    render(<DashboardTrend />)
    await screen.findByRole('table', { name: 'Totales diarios de ventas' })
    const before = reportCalls().length
    await user.type(screen.getByLabelText('Desde'), '2026-10-31')
    await user.type(screen.getByLabelText('Hasta'), '2026-10-01')
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    expect(await screen.findByText('Hasta debe ser igual o posterior a Desde.')).toBeVisible()
    expect(reportCalls()).toHaveLength(before)
  })
})

describe('alternar diario/mensual', () => {
  it('cambiar a mensual conserva el rango ya aplicado y consulta el nuevo tipo con él', async () => {
    const user = userEvent.setup()
    render(<DashboardTrend />)
    await screen.findByRole('table', { name: 'Totales diarios de ventas' })
    await user.type(screen.getByLabelText('Desde'), '2026-10-01')
    await user.type(screen.getByLabelText('Hasta'), '2026-10-31')
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    await screen.findByRole('table', { name: 'Totales diarios de ventas' })
    await user.click(screen.getByRole('button', { name: 'Mensuales' }))
    await screen.findByRole('table', { name: 'Totales mensuales de ventas' })
    expect(calls('/monthly').at(-1)?.[1]?.query).toEqual({ page: 1, limit: 20, from: '2026-10-01', to: '2026-10-31' })
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-01')
    expect(screen.getByRole('button', { name: 'Mensuales' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Diarios' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('roles', () => {
  it('SALESPERSON: ninguna de las dos consultas lleva un parámetro de propiedad', async () => {
    session.user.mockReturnValue({ sub: 'vendedor', role: 'SALESPERSON' })
    render(<DashboardTrend />)
    await screen.findByRole('table', { name: 'Totales diarios de ventas' })
    await screen.findByRole('table', { name: 'Productos más vendidos' })
    expect(Object.keys(calls('/daily')[0][1]?.query ?? {}).sort()).toEqual(['limit', 'page'])
    expect(Object.keys(calls('/top-products')[0][1]?.query ?? {}).sort()).toEqual(['limit', 'page'])
  })
})

describe('recuperación', () => {
  it('un panel con error ofrece su propio reintento sin ocultar el otro panel', async () => {
    const user = userEvent.setup()
    mockReports({ 'top-products': () => { throw failure(500) } })
    render(<DashboardTrend />)
    await screen.findByRole('table', { name: 'Totales diarios de ventas' })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudieron cargar los productos más vendidos.')
    mockReports()
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('table', { name: 'Productos más vendidos' })).toBeVisible()
  })
  it('401/403 no ofrecen reintento', async () => {
    mockReports({ daily: () => { throw failure(401) } })
    render(<DashboardTrend />)
    expect(await screen.findByText('La sesión ha finalizado. Vuelve a iniciar sesión desde SynkroTech.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })
  it('una respuesta obsoleta del rango anterior no sustituye al rango vigente', async () => {
    const user = userEvent.setup()
    const slow = deferred()
    apiClient.request.mockReset().mockReturnValueOnce(slow.promise).mockImplementation(async (path) => {
      if (path.endsWith('/daily')) return { data: [{ day: '2026-10-20', dailyTotalCents: 777, saleCount: 1 }], meta: meta({ total: 1 }) }
      if (path.endsWith('/top-products')) return top()
      if (path === `/api/v1/products/${ids.productA}`) return productFixture()
      throw failure(404)
    })
    render(<DashboardTrend />)
    await user.type(screen.getByLabelText('Desde'), '2026-10-20')
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    const table = await screen.findByRole('table', { name: 'Totales diarios de ventas' })
    expect(within(table).getByText(/7,77/)).toBeVisible()
    // El cliente ignora el abort y entrega la respuesta vieja después: no puede pisar el rango vigente.
    slow.resolve(daily())
    await Promise.resolve()
    expect(screen.queryByText(/1\.234\.567,89/)).toBeNull()
    expect(within(screen.getByRole('table', { name: 'Totales diarios de ventas' })).getByText(/7,77/)).toBeVisible()
  })
})
