import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { apiClient } from '../../test-doubles/shellApiClient'
import { customerFixture, failure, ids, productFixture, saleFixture } from '../../test-doubles/fixtures'
import { takeSalesNotice } from '../../navigation'
import { SaleDetailPage } from './SaleDetailPage'

const frozen = saleFixture({
  totalCents: 123456789,
  details: [
    { detailId: 'a', productId: ids.productA, quantity: 3, unitPriceCents: 12550, subtotalCents: 37650, active: true },
    { detailId: 'b', productId: ids.productB, quantity: 1, unitPriceCents: 7, subtotalCents: 7, active: true },
  ],
})
type Reply = () => Promise<unknown>
let replies: { sale: Reply; customer: Reply; product: (id: string) => Promise<unknown> }

beforeEach(() => {
  replies = {
    sale: () => Promise.resolve(frozen),
    customer: () => Promise.resolve(customerFixture()),
    // Today's catalogue price differs on purpose: history must never be repriced.
    product: (id) => Promise.resolve(productFixture({ productId: id, name: id === ids.productA ? 'Teclado mecánico' : 'Ratón óptico', priceCents: 999999 })),
  }
  apiClient.request.mockReset().mockImplementation((path) => {
    if (path.startsWith('/api/v1/sales/')) return replies.sale()
    if (path.startsWith('/api/v1/customers/')) return replies.customer()
    if (path.startsWith('/api/v1/products/')) return replies.product(path.split('/').pop()!)
    return Promise.reject(new Error(`unexpected ${path}`))
  })
  window.history.replaceState(null, '', `/sales/${ids.sale}`)
})
afterEach(() => window.history.replaceState(null, '', '/'))

const rowOf = (name: string) => screen.getByRole('row', { name: new RegExp(name) })

it('muestra un esqueleto de cabecera, cliente y líneas mientras carga', () => {
  apiClient.request.mockReturnValue(new Promise(() => {}))
  render(<SaleDetailPage saleId={ids.sale} />)
  expect(screen.getByRole('status')).toHaveTextContent('Cargando venta…')
  expect(screen.getByRole('heading', { name: 'Detalle de venta' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Volver al historial' })).toHaveAttribute('href', '/sales')
  expect(screen.queryByRole('table')).toBeNull()
})

it('compone la venta: identificador, fecha, total autoritativo, cliente y líneas con precios congelados', async () => {
  render(<SaleDetailPage saleId={ids.sale} />)
  expect(await screen.findByText('Ana Pérez')).toBeVisible()
  expect(screen.getByText(ids.sale)).toBeVisible()
  expect(screen.getByText(/12 oct 2026|oct 2026/)).toBeVisible()
  expect(screen.getByText('Total de la venta').parentElement).toHaveTextContent(/1\.234\.567,89/)
  expect(screen.getByText(/1075123456/)).toBeVisible()
  const table = screen.getByRole('table', { name: 'Líneas de la venta' })
  expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Producto', 'Cantidad', 'Precio unitario', 'Subtotal'])
  await waitFor(() => expect(within(rowOf('Teclado mecánico')).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(expect.arrayContaining(['3'])))
  const keyboard = within(rowOf('Teclado mecánico')).getAllByRole('cell').map((cell) => cell.textContent ?? '')
  expect(keyboard[1]).toBe('3')
  expect(keyboard[2]).toMatch(/125,50/)
  expect(keyboard[3]).toMatch(/376,50/)
  expect(within(rowOf('Ratón óptico')).getAllByRole('cell')[2]).toHaveTextContent(/0,07/)
  expect(screen.queryByText(/9\.999,99/)).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
})

it('usa solo GET sobre Sales, Customers y Products', async () => {
  render(<SaleDetailPage saleId={ids.sale} />)
  await screen.findByText('Ana Pérez')
  await screen.findByText('Teclado mecánico')
  expect(apiClient.request.mock.calls.map(([path]) => path).sort()).toEqual([
    `/api/v1/customers/${ids.customer}`, `/api/v1/products/${ids.productA}`, `/api/v1/products/${ids.productB}`, `/api/v1/sales/${ids.sale}`,
  ])
  expect(apiClient.request.mock.calls.every(([, options]) => !options?.method)).toBe(true)
})

it('«Volver al historial» navega a /sales sin recargar', async () => {
  render(<SaleDetailPage saleId={ids.sale} />)
  await screen.findByText('Ana Pérez')
  await userEvent.setup().click(screen.getByRole('link', { name: 'Volver al historial' }))
  expect(window.location.pathname).toBe('/sales')
})

it('cliente no disponible: conserva venta y montos, muestra el identificador y un aviso contextual', async () => {
  replies.customer = () => Promise.reject(failure(404))
  render(<SaleDetailPage saleId={ids.sale} />)
  expect(await screen.findByText(ids.customer)).toBeVisible()
  expect(screen.getByRole('status', { name: 'Aviso de datos incompletos' })).toHaveTextContent('No se pudo cargar la información del cliente. Se muestra el identificador guardado.')
  expect(screen.queryByText('Ana Pérez')).toBeNull()
  expect(screen.getByText('Total de la venta').parentElement).toHaveTextContent(/1\.234\.567,89/)
  await screen.findByText('Teclado mecánico')
})

it('producto no disponible: muestra su identificador sin inventar nombre y mantiene precios congelados', async () => {
  replies.product = (id) => (id === ids.productB ? Promise.reject(failure(503)) : Promise.resolve(productFixture({ productId: id, name: 'Teclado mecánico' })))
  render(<SaleDetailPage saleId={ids.sale} />)
  await screen.findByText('Teclado mecánico')
  const row = await waitFor(() => rowOf(ids.productB))
  expect(row).toHaveTextContent(/0,07/)
  expect(screen.getByRole('status', { name: 'Aviso de datos incompletos' })).toHaveTextContent('No se pudo cargar la información de uno o más productos. Se muestran los identificadores guardados.')
})

it('«Reintentar información» repite solo los metadatos y completa la vista', async () => {
  let fail = true
  replies.customer = () => (fail ? Promise.reject(failure(0, 'NETWORK_ERROR')) : Promise.resolve(customerFixture()))
  const user = userEvent.setup()
  render(<SaleDetailPage saleId={ids.sale} />)
  await screen.findByText(ids.customer)
  const salesCalls = () => apiClient.request.mock.calls.filter(([path]) => path.startsWith('/api/v1/sales/')).length
  fail = false
  await user.click(screen.getByRole('button', { name: 'Reintentar información' }))
  expect(await screen.findByText('Ana Pérez')).toBeVisible()
  expect(salesCalls()).toBe(1)
  expect(screen.queryByRole('button', { name: 'Reintentar información' })).toBeNull()
})

it('404: «Venta no encontrada» con enlace al historial y sin reintento', async () => {
  replies.sale = () => Promise.reject(failure(404, 'NOT_FOUND'))
  render(<SaleDetailPage saleId={ids.sale} />)
  expect(await screen.findByRole('heading', { name: 'Venta no encontrada' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Volver al historial' })).toHaveAttribute('href', '/sales')
  expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
})

it('403: redirige a /sales (reemplazando la entrada) con aviso en español', async () => {
  replies.sale = () => Promise.reject(failure(403, 'FORBIDDEN'))
  const before = window.history.length
  render(<SaleDetailPage saleId={ids.sale} />)
  await waitFor(() => expect(window.location.pathname).toBe('/sales'))
  expect(window.history.length).toBe(before)
  expect(takeSalesNotice()).toBe('forbidden')
  expect(apiClient.request.mock.calls.some(([path]) => path.startsWith('/api/v1/customers') || path.startsWith('/api/v1/products'))).toBe(false)
})

it('error del servicio: alerta recuperable en español con referencia y Reintentar', async () => {
  let attempts = 0
  replies.sale = () => (++attempts === 1 ? Promise.reject(failure(500)) : Promise.resolve(frozen))
  const user = userEvent.setup()
  render(<SaleDetailPage saleId={ids.sale} />)
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('No se pudo cargar la venta.')
  expect(alert).toHaveTextContent('Referencia: trace-example')
  expect(alert).not.toHaveTextContent(/Raw English/)
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText('Ana Pérez')).toBeVisible()
})

it('error de red: distingue la conexión, y 401 deja la sesión al host sin reintento', async () => {
  replies.sale = () => Promise.reject(failure(0, 'NETWORK_ERROR'))
  const { unmount } = render(<SaleDetailPage saleId={ids.sale} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor.')
  unmount()
  replies.sale = () => Promise.reject(failure(401, 'UNAUTHORIZED'))
  render(<SaleDetailPage saleId={ids.sale} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('La sesión ha finalizado. Vuelve a iniciar sesión desde SynkroTech.')
  expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
})

it('una venta anulada se rotula sin ocultar sus datos', async () => {
  replies.sale = () => Promise.resolve({ ...frozen, active: false })
  render(<SaleDetailPage saleId={ids.sale} />)
  expect(await screen.findByText('Esta venta está anulada.')).toBeVisible()
  expect(screen.getByRole('table', { name: 'Líneas de la venta' })).toBeVisible()
})

it('no actualiza nada tras desmontar', async () => {
  let resolve!: (value: unknown) => void
  replies.sale = () => new Promise((yes) => { resolve = yes })
  const { unmount } = render(<SaleDetailPage saleId={ids.sale} />)
  unmount()
  await act(async () => { resolve(frozen) })
  expect(apiClient.request.mock.calls.some(([path]) => path.startsWith('/api/v1/customers'))).toBe(false)
})
