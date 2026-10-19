import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { apiClient } from '../../test-doubles/shellApiClient'
import { session } from '../../test-doubles/shellSession'
import { customerFixture, ids, pageOf, productFixture, sagaFixture, saleFixture } from '../../test-doubles/fixtures'
import { redirectToSales } from '../../navigation'
import { SalesPage } from './SalesPage'

const completed = sagaFixture({ status: 'COMPLETED', completedSteps: ['validate-customer', 'reserve-stock', 'register-sale'], saleId: ids.sale })
const historyCalls = () => apiClient.request.mock.calls.filter(([path, options]) => path === '/api/v1/sales' && !options?.method)

beforeEach(() => {
  session.user.mockReset().mockReturnValue({ sub: ids.user, role: 'SALESPERSON' })
  let listed = 0
  apiClient.request.mockReset().mockImplementation((path, options) => {
    if (path === '/api/v1/sales') {
      listed += 1
      return Promise.resolve({ data: listed > 1 ? [saleFixture()] : [], meta: { page: 1, limit: 20, total: listed > 1 ? 1 : 0, totalPages: listed > 1 ? 1 : 0 } })
    }
    if (path === '/api/v1/customers') return Promise.resolve(pageOf([customerFixture()]))
    if (path === '/api/v1/products') return Promise.resolve(pageOf([productFixture()]))
    if (path === '/api/v1/sagas/register-sale') return Promise.resolve(completed)
    if (path === `/api/v1/sales/${ids.sale}`) return Promise.resolve(saleFixture())
    return Promise.reject(new Error(`unexpected ${options?.method ?? 'GET'} ${path}`))
  })
})
afterEach(() => window.history.replaceState(null, '', '/'))

it('muestra el formulario «Nueva venta» sobre el historial en la misma pantalla', async () => {
  render(<SalesPage />)
  const headings = screen.getAllByRole('heading').map((heading) => heading.textContent)
  expect(headings).toEqual(['Ventas', 'Nueva venta', 'Historial'])
  expect(await screen.findByText('No hay ventas registradas todavía.')).toBeVisible()
  expect(screen.getByLabelText('Desde')).toBeVisible()
})

it('tras una venta confirmada recarga el historial desde Sales y la lista nueva aparece', async () => {
  const user = userEvent.setup()
  render(<SalesPage />)
  await screen.findByText('No hay ventas registradas todavía.')
  await user.type(screen.getByLabelText('Documento del cliente'), '1075123456')
  await user.click(screen.getByRole('button', { name: 'Buscar cliente' }))
  await user.click(await screen.findByRole('button', { name: 'Seleccionar cliente' }))
  const line = screen.getByRole('group', { name: 'Línea 1' })
  await user.type(within(line).getByLabelText('Buscar producto'), 'teclado')
  await user.click(within(line).getByRole('button', { name: 'Buscar producto' }))
  await user.selectOptions(await within(line).findByLabelText('Producto'), ids.productA)
  await user.type(within(line).getByLabelText('Cantidad'), '2')
  await user.click(screen.getByRole('button', { name: 'Registrar venta' }))
  expect((await screen.findAllByText('Venta registrada'))[0]).toBeVisible()
  expect(await screen.findByRole('link', { name: `Ver venta ${ids.sale}` })).toBeVisible()
  expect(historyCalls().length).toBeGreaterThanOrEqual(2)
  expect(historyCalls().at(-1)?.[1]?.query).toMatchObject({ page: 1, limit: 20 })
})

it('muestra una sola vez el aviso de acceso denegado dejado por el detalle y se puede cerrar', async () => {
  window.history.replaceState(null, '', '/sales/other')
  redirectToSales('forbidden')
  const user = userEvent.setup()
  const { unmount } = render(<SalesPage />)
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('No tienes permiso para ver esa venta. Solo puedes consultar las ventas que registraste tú.')
  expect(window.history.state).toBeNull()
  await user.click(within(alert).getByRole('button', { name: 'Cerrar aviso' }))
  expect(screen.queryByText(/No tienes permiso para ver esa venta/)).toBeNull()
  unmount()
  render(<SalesPage />)
  expect(screen.queryByText(/No tienes permiso para ver esa venta/)).toBeNull()
})
