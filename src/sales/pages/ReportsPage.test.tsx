import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { apiClient } from '../../test-doubles/shellApiClient'
import { session } from '../../test-doubles/shellSession'
import { deferred, failure, ids, productFixture } from '../../test-doubles/fixtures'
import { ReportsPage } from './ReportsPage'

const meta = (page = 1, totalPages = 2, total = 25) => ({ page, limit: 20, total, totalPages })
const daily = { data: [{ day: '2026-10-12', dailyTotalCents: 123456789, saleCount: 3 }, { day: '2026-10-11', dailyTotalCents: 5, saleCount: 1 }], meta: meta() }
const monthly = { data: [{ month: '2026-10-01', monthlyTotalCents: 99900, saleCount: 7 }], meta: meta(1, 1, 1) }
const top = { data: [{ productId: ids.productA, totalQuantity: 12, totalRevenueCents: 150600 }, { productId: ids.productB, totalQuantity: 4, totalRevenueCents: 400 }], meta: meta(1, 1, 2) }
const empty = { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }

beforeEach(() => {
  session.user.mockReset().mockReturnValue({ sub: 'identity', role: 'ADMIN' })
  apiClient.request.mockReset().mockImplementation(async (path) => {
    if (path.endsWith('/daily')) return daily
    if (path.endsWith('/monthly')) return monthly
    if (path.endsWith('/top-products')) return top
    if (path === `/api/v1/products/${ids.productA}`) return productFixture()
    throw failure(404)
  })
})
const reportCalls = () => apiClient.request.mock.calls.filter(([path]) => path.includes('/reports/'))

describe('datos', () => {
  it('diario: filas en centavos exactos, día UTC y total de grupos (no de ventas)', async () => {
    render(<ReportsPage kind="daily" />)
    const table = await screen.findByRole('table', { name: 'Totales diarios de ventas' })
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Día', 'Ventas', 'Total'])
    expect(within(table).getByText(/1\.234\.567,89/)).toBeVisible()
    expect(within(table).getByText(/12.*oct.*2026/i)).toBeVisible()
    expect(within(table).getByText(/0,05/)).toBeVisible()
    expect(table.querySelector('time[datetime="2026-10-12"]')).not.toBeNull()
    expect(screen.getByRole('navigation', { name: 'Paginación del reporte' })).toHaveTextContent('Página 1 de 2 · 25 días · 20 por página')
    expect(reportCalls()).toHaveLength(1)
  })
  it('mensual: muestra el mes y el número de ventas', async () => {
    render(<ReportsPage kind="monthly" />)
    const table = await screen.findByRole('table', { name: 'Totales mensuales de ventas' })
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Mes', 'Ventas', 'Total'])
    expect(within(table).getByText(/octubre.*2026/i)).toBeVisible()
    expect(within(table).getByText(/999,00/)).toBeVisible()
  })
  it('más vendidos: resuelve el nombre del producto y conserva el identificador cuando no se puede', async () => {
    render(<ReportsPage kind="top-products" />)
    const table = await screen.findByRole('table', { name: 'Productos más vendidos' })
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Producto', 'Cantidad vendida', 'Ingresos'])
    expect(await within(table).findByText('Teclado mecánico')).toBeVisible()
    // El segundo producto devuelve 404: nunca se inventa un nombre, queda el identificador.
    expect(within(table).getAllByText(ids.productB)[0]).toBeVisible()
    expect(within(table).getByText(/1\.506,00/)).toBeVisible()
  })
})

describe('cuatro estados', () => {
  it('cargando: anuncia el estado, mantiene los filtros y no muestra datos', () => {
    apiClient.request.mockReturnValue(new Promise(() => {}))
    render(<ReportsPage kind="daily" />)
    expect(screen.getAllByRole('status').find((node) => node.textContent === 'Cargando reporte…')).toBeVisible()
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByLabelText('Desde')).toBeVisible()
  })
  it('vacío sin filtros y con filtros', async () => {
    const user = userEvent.setup()
    apiClient.request.mockResolvedValue(empty)
    render(<ReportsPage kind="daily" />)
    expect(await screen.findByText('Todavía no hay ventas para este reporte.')).toBeVisible()
    await user.type(screen.getByLabelText('Desde'), '2026-10-01')
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    expect(await screen.findByText('Ningún resultado coincide con estos filtros.')).toBeVisible()
    await user.click(screen.getAllByRole('button', { name: /Limpiar filtros/ })[0])
    expect(reportCalls().at(-1)?.[1]?.query).toEqual({ page: 1, limit: 20 })
  })
  it('error con traza y reintento que recupera los datos', async () => {
    const user = userEvent.setup()
    apiClient.request.mockRejectedValueOnce(failure(0, 'NETWORK_ERROR'))
    render(<ReportsPage kind="daily" />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudo cargar el reporte.')
    expect(alert).toHaveTextContent('trace-example')
    expect(screen.queryByText(/Raw English/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('table', { name: 'Totales diarios de ventas' })).toBeVisible()
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('401 explica la sesión y no ofrece reintento; 403 explica el permiso y no ofrece reintento', async () => {
    apiClient.request.mockRejectedValueOnce(failure(401))
    const { unmount } = render(<ReportsPage kind="daily" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('La sesión ha finalizado')
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
    unmount()
    apiClient.request.mockRejectedValueOnce(failure(403))
    render(<ReportsPage kind="daily" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para consultar los reportes de ventas.')
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })
})

describe('filtros y paginación', () => {
  it('envía el rango UTC inclusivo tal cual y vuelve a la página 1', async () => {
    const user = userEvent.setup()
    render(<ReportsPage kind="daily" />)
    await screen.findByRole('table', { name: 'Totales diarios de ventas' })
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await screen.findByRole('table', { name: 'Totales diarios de ventas' })
    await user.type(screen.getByLabelText('Desde'), '2026-10-01')
    await user.type(screen.getByLabelText('Hasta'), '2026-10-31')
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    await screen.findByRole('table', { name: 'Totales diarios de ventas' })
    expect(reportCalls().map(([, options]) => options?.query)).toEqual([
      { page: 1, limit: 20 }, { page: 2, limit: 20 }, { page: 1, limit: 20, from: '2026-10-01', to: '2026-10-31' },
    ])
  })
  it('un rango invertido se explica y no llama a la API', async () => {
    const user = userEvent.setup()
    render(<ReportsPage kind="monthly" />)
    await screen.findByRole('table')
    await user.type(screen.getByLabelText('Desde'), '2026-10-31')
    await user.type(screen.getByLabelText('Hasta'), '2026-10-01')
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    expect(await screen.findByText('Hasta debe ser igual o posterior a Desde.')).toBeVisible()
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('aria-invalid', 'true')
    expect(reportCalls()).toHaveLength(1)
  })
  it('una respuesta tardía del filtro anterior no pisa el filtro actual', async () => {
    const user = userEvent.setup()
    const slow = deferred()
    apiClient.request.mockReset().mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ data: [{ day: '2026-10-20', dailyTotalCents: 777, saleCount: 1 }], meta: meta(1, 1, 1) })
    render(<ReportsPage kind="daily" />)
    await user.type(screen.getByLabelText('Desde'), '2026-10-20')
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    expect(await screen.findByText(/7,77/)).toBeVisible()
    slow.resolve(daily)
    await Promise.resolve()
    expect(screen.queryByText(/1\.234\.567,89/)).toBeNull()
    expect(screen.getByText(/7,77/)).toBeVisible()
  })
})

describe('roles', () => {
  it('SALESPERSON ve el texto de su propia contribución y la API no recibe parámetros de propiedad', async () => {
    session.user.mockReturnValue({ sub: 'vendedor', role: 'SALESPERSON' })
    render(<ReportsPage kind="daily" />)
    expect(screen.getByText('Consulta tu contribución a las ventas.')).toBeVisible()
    await screen.findByRole('table')
    expect(Object.keys(reportCalls()[0][1]?.query ?? {}).sort()).toEqual(['limit', 'page'])
  })
  it('ADMIN ve el texto del total', async () => {
    render(<ReportsPage kind="daily" />)
    expect(screen.getByText('Consulta los totales de todas las ventas.')).toBeVisible()
    await screen.findByRole('table')
  })
  it.each(['INVENTORY', 'DESCONOCIDO'])('%s no recibe el reporte ni dispara ninguna solicitud', (role) => {
    session.user.mockReturnValue({ sub: 'otro', role })
    render(<ReportsPage kind="top-products" />)
    expect(screen.getByRole('alert')).toHaveTextContent('No tienes permiso para consultar los reportes de ventas.')
    expect(screen.queryByRole('table')).toBeNull()
    expect(apiClient.request).not.toHaveBeenCalled()
  })
})

describe('navegación de Ventas', () => {
  it('marca la sección actual y enlaza con las demás sin recargar el documento', async () => {
    render(<ReportsPage kind="monthly" />)
    const nav = screen.getByRole('navigation', { name: 'Secciones de Ventas' })
    expect(within(nav).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Historial', '/sales'], ['Diarios', '/sales/reports/daily'], ['Mensuales', '/sales/reports/monthly'], ['Más vendidos', '/sales/reports/top-products'],
    ])
    expect(within(nav).getByRole('link', { name: 'Mensuales' })).toHaveAttribute('aria-current', 'page')
    await screen.findByRole('table')
  })
})
