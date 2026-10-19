import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { apiClient } from '../../test-doubles/shellApiClient'
import { session } from '../../test-doubles/shellSession'
import { customerFixture, failure, ids, pageOf, productFixture, sagaFixture, saleFixture } from '../../test-doubles/fixtures'
import { NewSalePanel } from './NewSalePanel'

const SAGAS = '/api/v1/sagas'
let postReplies: unknown[]
let getReplies: unknown[]
const reply = (queue: unknown[]) => {
  const value = queue.length > 1 ? queue.shift() : queue[0]
  return value && typeof value === 'object' && 'body' in value ? Promise.reject(value) : Promise.resolve(value)
}
const posts = () => apiClient.request.mock.calls.filter(([path, options]) => path === `${SAGAS}/register-sale` && options?.method === 'POST')
const completed = sagaFixture({ status: 'COMPLETED', completedSteps: ['validate-customer', 'reserve-stock', 'register-sale'], saleId: ids.sale })

beforeEach(() => {
  session.user.mockReturnValue({ sub: ids.user, role: 'SALESPERSON' })
  postReplies = [completed]
  getReplies = [completed]
  let counter = 0
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`)
  apiClient.request.mockReset().mockImplementation((path) => {
    if (path === '/api/v1/customers') return Promise.resolve(pageOf([customerFixture()]))
    if (path === '/api/v1/products') return Promise.resolve(pageOf([productFixture()]))
    if (path === `${SAGAS}/register-sale`) return reply(postReplies)
    if (path.startsWith(`${SAGAS}/`)) return reply(getReplies)
    if (path === `/api/v1/sales/${ids.sale}`) return Promise.resolve(saleFixture({ totalCents: 25100 }))
    return Promise.reject(new Error(`unexpected ${path}`))
  })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

type User = ReturnType<typeof userEvent.setup>
async function fill(user: User) {
  await user.type(screen.getByLabelText('Documento del cliente'), '1075123456')
  await user.click(screen.getByRole('button', { name: 'Buscar cliente' }))
  await user.click(await screen.findByRole('button', { name: 'Seleccionar cliente' }))
  const line = screen.getByRole('group', { name: 'Línea 1' })
  await user.type(within(line).getByLabelText('Buscar producto'), 'teclado')
  await user.click(within(line).getByRole('button', { name: 'Buscar producto' }))
  await user.selectOptions(await within(line).findByLabelText('Producto'), ids.productA)
  await user.type(within(line).getByLabelText('Cantidad'), '2')
}
const submit = (user: User) => user.click(screen.getByRole('button', { name: 'Registrar venta' }))

it('muestra el encabezado «Nueva venta» y el formulario inicial', () => {
  render(<NewSalePanel onRegistered={vi.fn()} />)
  expect(screen.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  expect(screen.getByRole('form', { name: 'Formulario de nueva venta' })).toBeVisible()
})

it('éxito: envía solo cliente y líneas con clave, confirma, muestra el total de Sales, limpia el formulario y avisa para refrescar el historial', async () => {
  const onRegistered = vi.fn()
  const user = userEvent.setup()
  render(<NewSalePanel onRegistered={onRegistered} />)
  await fill(user)
  await submit(user)
  expect(await screen.findByText('Venta registrada')).toBeVisible()
  const [, options] = posts()[0]
  expect(options).toMatchObject({ method: 'POST', idempotencyKey: '00000000-0000-4000-8000-000000000001', body: { customerId: ids.customer, lines: [{ productId: ids.productA, quantity: 2 }] } })
  expect(await screen.findByText(/251,00/, { selector: '[role="status"] *' })).toBeVisible()
  expect(onRegistered).toHaveBeenCalledTimes(1)
  expect(onRegistered).toHaveBeenCalledWith(ids.sale)
  expect(screen.getByLabelText('Documento del cliente')).toHaveValue('')
  expect(apiClient.request.mock.calls.some(([path, o]) => path === '/api/v1/sales' && o?.method === 'POST')).toBe(false)
})

it('stock insuficiente: alerta aprobada, formulario conservado y reenvío editable con clave nueva', async () => {
  postReplies = [sagaFixture({ status: 'COMPENSATED', failedStep: 'reserve-stock', completedSteps: ['validate-customer'] })]
  const user = userEvent.setup()
  render(<NewSalePanel onRegistered={vi.fn()} />)
  await fill(user)
  await submit(user)
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('No se pudo completar la venta')
  expect(alert).toHaveTextContent('Paso fallido: reserva de stock')
  expect(alert).toHaveTextContent('No hay stock suficiente para uno o más productos de la venta.')
  expect(screen.getByText('Ana Pérez')).toBeVisible()
  expect(screen.getByLabelText('Cantidad')).toHaveValue('2')
  const quantity = screen.getByLabelText('Cantidad')
  await user.clear(quantity)
  await user.type(quantity, '1')
  await submit(user)
  expect(posts()).toHaveLength(2)
  expect(posts()[1][1]?.idempotencyKey).toBe('00000000-0000-4000-8000-000000000002')
})

it('error de red: conserva el formulario y «Reintentar envío» reutiliza la misma clave', async () => {
  postReplies = [failure(0, 'NETWORK_ERROR'), completed]
  const user = userEvent.setup()
  render(<NewSalePanel onRegistered={vi.fn()} />)
  await fill(user)
  await submit(user)
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo confirmar si la venta fue recibida')
  expect(screen.getByLabelText('Cantidad')).toHaveValue('2')
  await user.click(screen.getByRole('button', { name: 'Reintentar envío' }))
  expect(await screen.findByText('Venta registrada')).toBeVisible()
  expect(posts().map(([, o]) => o?.idempotencyKey)).toEqual(['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'])
})

it('RUNNING: anuncia el procesamiento, bloquea el formulario y consulta hasta COMPLETED sin otro POST', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  postReplies = [sagaFixture()]
  getReplies = [completed]
  render(<NewSalePanel onRegistered={vi.fn()} />)
  await fill(user)
  await submit(user)
  expect(await screen.findByText('Procesando venta…')).toBeVisible()
  expect(screen.getByRole('button', { name: /Registrando venta/ })).toBeDisabled()
  expect(screen.getByLabelText('Cantidad')).toBeDisabled()
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(await screen.findByText('Venta registrada')).toBeVisible()
  expect(posts()).toHaveLength(1)
})

it('FAILED: alerta de atención con el código de la saga; reenviar la misma venta queda bloqueado', async () => {
  postReplies = [sagaFixture({ status: 'FAILED', failedStep: 'register-sale' })]
  const user = userEvent.setup()
  render(<NewSalePanel onRegistered={vi.fn()} />)
  await fill(user)
  await submit(user)
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('La venta requiere atención')
  expect(alert).toHaveTextContent(ids.saga)
  expect(screen.getByRole('button', { name: 'Registrar venta' })).toBeDisabled()
  expect(screen.getByText(/requiere atención. No la reenvíes/)).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Entendido' })).toBeNull()
  expect(screen.getByRole('alert')).toHaveTextContent(ids.saga)
})

it('«Limpiar» vacía el formulario y descarta un resultado ya cerrado', async () => {
  postReplies = [sagaFixture({ status: 'COMPENSATED', failedStep: 'validate-customer' })]
  const user = userEvent.setup()
  render(<NewSalePanel onRegistered={vi.fn()} />)
  await fill(user)
  await submit(user)
  await screen.findByRole('alert')
  await user.click(screen.getByRole('button', { name: 'Limpiar' }))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByLabelText('Documento del cliente')).toHaveValue('')
})

it('un formulario inválido no llama a Workflow', async () => {
  const user = userEvent.setup()
  render(<NewSalePanel onRegistered={vi.fn()} />)
  await submit(user)
  expect(posts()).toHaveLength(0)
  expect(apiClient.request).not.toHaveBeenCalled()
})
