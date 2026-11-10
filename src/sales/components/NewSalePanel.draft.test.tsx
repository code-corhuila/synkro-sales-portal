import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { apiClient } from '../../test-doubles/shellApiClient'
import { notifySession, session } from '../../test-doubles/shellSession'
import { customerFixture, failure, ids, pageOf, productFixture, sagaFixture, saleFixture } from '../../test-doubles/fixtures'
import { removeDraft } from '../model/draftJournal'
import { removeIntent } from '../model/intentJournal'
import { NewSalePanel } from './NewSalePanel'

// eslint-disable-next-line no-restricted-globals -- Tests inspect the non-credential recovery record.
const storage = sessionStorage


// Navigation and reload are simulated by unmounting the panel: the page state is gone and only
// what the portal chose to keep in sessionStorage can bring the sale back.

const SAGAS = '/api/v1/sagas'
const DRAFT_KEY = 'synkro.sales.draft.v1'
const ana = { customerId: ids.customer, name: 'Ana Pérez', identityDocument: '1075123456', active: true, match: 'NAME' }
const completed = sagaFixture({ status: 'COMPLETED', completedSteps: ['validate-customer', 'reserve-stock', 'register-sale'], saleId: ids.sale })

let products: Record<string, ReturnType<typeof productFixture>>
let customerGet: () => Promise<unknown>
let postReplies: unknown[]
let getReplies: unknown[]
const reply = (queue: unknown[]) => {
  const value = queue.length > 1 ? queue.shift() : queue[0]
  return value && typeof value === 'object' && 'body' in value ? Promise.reject(value) : Promise.resolve(value)
}
const posts = () => apiClient.request.mock.calls.filter(([path, options]) => path === `${SAGAS}/register-sale` && options?.method === 'POST')
const paths = (prefix: string) => apiClient.request.mock.calls.filter(([path]) => path.startsWith(prefix))

beforeEach(() => {
  removeDraft(); removeIntent()
  session.user.mockReturnValue({ sub: ids.user, role: 'SALESPERSON' })
  session.sessionId.mockReturnValue('s-1')
  products = {
    [ids.productA]: productFixture(),
    [ids.productB]: productFixture({ productId: ids.productB, name: 'Ratón óptico', priceCents: 5000, stock: 3 }),
  }
  customerGet = async () => customerFixture()
  postReplies = [completed]
  getReplies = [completed]
  let counter = 0
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`)
  apiClient.request.mockReset().mockImplementation(async (path, options) => {
    if (path === '/api/v1/customers/search') return { data: [ana], meta: { limit: 5, hasMore: false } }
    if (path === `/api/v1/customers/${ids.customer}`) return customerGet()
    if (path === '/api/v1/products/categories') return { data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } }
    if (path === '/api/v1/products' && !options?.method) return pageOf(Object.values(products))
    const one = /^\/api\/v1\/products\/([0-9a-f-]+)$/.exec(path)
    if (one) { const found = products[one[1]]; if (!found) throw failure(404, 'NOT_FOUND'); return found }
    if (path === `${SAGAS}/register-sale`) return reply(postReplies)
    if (path.startsWith(`${SAGAS}/`)) return reply(getReplies)
    if (path === `/api/v1/sales/${ids.sale}`) return saleFixture({ totalCents: 25100 })
    throw new Error(`unexpected ${path}`)
  })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

type User = ReturnType<typeof userEvent.setup>
const customerBox = () => screen.getByRole('combobox', { name: /cliente/i })
const cart = () => screen.getByRole('region', { name: 'Venta actual' })
async function fill(user: User, clicks = 2) {
  await user.type(customerBox(), 'ana')
  await user.click(await screen.findByRole('option', { name: /Ana Pérez/ }))
  const tile = await screen.findByRole('button', { name: /^Agregar Teclado mecánico,/ })
  for (let i = 0; i < clicks; i += 1) await user.click(tile)
}
const mount = () => render(<NewSalePanel onRegistered={vi.fn()} />)

describe('salir y volver', () => {
  it('al volver recupera cliente, productos y cantidades, sin duplicar líneas', async () => {
    const user = userEvent.setup()
    const first = mount()
    await fill(user, 3)
    first.unmount()
    mount()
    expect(await screen.findByText('Ana Pérez')).toBeVisible()
    await waitFor(() => expect(within(cart()).getByLabelText('Cantidad de Teclado mecánico')).toHaveValue('3'))
    expect(within(cart()).getAllByRole('listitem')).toHaveLength(1)
    // The sale is rebuilt from the services, not from what was stored.
    expect(paths(`/api/v1/customers/${ids.customer}`)).toHaveLength(1)
    expect(paths(`/api/v1/products/${ids.productA}`)).toHaveLength(1)
  })

  it('anuncia mientras recupera y no deja registrar hasta terminar', async () => {
    const user = userEvent.setup()
    const first = mount()
    await fill(user)
    first.unmount()
    let release!: () => void
    customerGet = () => new Promise((resolve) => { release = () => resolve(customerFixture()) })
    mount()
    expect(await screen.findByText(/Recuperando tu venta en curso/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Registrar venta' })).toBeDisabled()
    await act(async () => { release() })
    await screen.findByText('Ana Pérez')
    expect(screen.queryByText(/Recuperando tu venta en curso/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Registrar venta' })).toBeEnabled()
  })

  it('"Crear cliente nuevo" navega en la misma pestaña, conserva la venta y al volver se recupera', async () => {
    const user = userEvent.setup()
    const first = mount()
    await user.click(await screen.findByRole('button', { name: /^Agregar Teclado mecánico,/ }))
    await user.click(screen.getByRole('button', { name: /^Agregar Teclado mecánico,/ }))
    const link = screen.getByRole('link', { name: /Crear cliente nuevo/ })
    expect(link).toHaveAttribute('href', '/customers')
    expect(link).not.toHaveAttribute('target')
    await user.click(link)
    expect(window.location.pathname).toBe('/customers')
    first.unmount()
    window.history.pushState(null, '', '/sales')
    mount()
    await waitFor(() => expect(within(cart()).getByLabelText('Cantidad de Teclado mecánico')).toHaveValue('2'))
    // The new customer is then searched in the same screen, and the cart is still there.
    await user.type(customerBox(), 'ana')
    await user.click(await screen.findByRole('option', { name: /Ana Pérez/ }))
    expect(within(cart()).getByLabelText('Cantidad de Teclado mecánico')).toHaveValue('2')
  })

  it('guarda solo identificadores y cantidades', async () => {
    const user = userEvent.setup()
    mount()
    await fill(user)
    const raw = storage.getItem(DRAFT_KEY)!
    expect(JSON.parse(raw).draft).toEqual({ customerId: ids.customer, lines: [{ productId: ids.productA, quantity: 2 }] })
    expect(raw).not.toMatch(/Ana|Teclado|1075123456|12550/)
  })

  it('al quitar todo el contenido deja de guardar algo', async () => {
    const user = userEvent.setup()
    mount()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect(storage.getItem(DRAFT_KEY)).toBeNull()
  })
})

describe('revalidación al recuperar', () => {
  it('ajusta la cantidad si el stock bajó mientras tanto y lo avisa', async () => {
    const user = userEvent.setup()
    const first = mount()
    await fill(user, 5)
    first.unmount()
    products[ids.productA] = productFixture({ stock: 3 })
    mount()
    await waitFor(() => expect(within(cart()).getByLabelText('Cantidad de Teclado mecánico')).toHaveValue('3'))
    expect(screen.getByRole('status', { name: 'Avisos de la venta recuperada' })).toHaveTextContent('se ajustó la cantidad de 5 a 3')
  })

  it('quita un producto que ya no existe y conserva el resto', async () => {
    const user = userEvent.setup()
    const first = mount()
    await fill(user)
    await user.click(await screen.findByRole('button', { name: /^Agregar Ratón óptico,/ }))
    first.unmount()
    delete products[ids.productA]
    mount()
    await waitFor(() => expect(within(cart()).getByLabelText('Cantidad de Ratón óptico')).toHaveValue('1'))
    expect(within(cart()).queryByLabelText('Cantidad de Teclado mecánico')).toBeNull()
    expect(screen.getByRole('status', { name: 'Avisos de la venta recuperada' })).toHaveTextContent('ya no está disponible')
  })

  it('si el cliente ya no está disponible lo quita, conserva el carrito y pide elegir otro', async () => {
    const user = userEvent.setup()
    const first = mount()
    await fill(user)
    first.unmount()
    customerGet = async () => { throw failure(404, 'NOT_FOUND') }
    mount()
    expect(await screen.findByText('El cliente de la venta ya no está disponible. Elige otro cliente.')).toBeVisible()
    expect(customerBox()).toBeVisible()
    await waitFor(() => expect(within(cart()).getByLabelText('Cantidad de Teclado mecánico')).toHaveValue('2'))
  })

  it('si no puede recuperar por un error del servicio ofrece reintentar y no pierde el borrador', async () => {
    const user = userEvent.setup()
    const first = mount()
    await fill(user)
    first.unmount()
    customerGet = async () => { throw failure(500) }
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo recuperar la venta en curso/)
    expect(storage.getItem(DRAFT_KEY)).not.toBeNull()
    customerGet = async () => customerFixture()
    await user.click(screen.getByRole('button', { name: 'Reintentar recuperación' }))
    expect(await screen.findByText('Ana Pérez')).toBeVisible()
    await waitFor(() => expect(within(cart()).getByLabelText('Cantidad de Teclado mecánico')).toHaveValue('2'))
  })

  it('permite descartar el borrador que no se pudo recuperar', async () => {
    const user = userEvent.setup()
    const first = mount()
    await fill(user)
    first.unmount()
    customerGet = async () => { throw failure(500) }
    mount()
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Descartar borrador' }))
    expect(storage.getItem(DRAFT_KEY)).toBeNull()
    expect(customerBox()).toBeVisible()
    expect(within(cart()).queryByRole('listitem')).toBeNull()
  })
})

describe('limpieza', () => {
  it('una venta confirmada borra el borrador', async () => {
    const user = userEvent.setup()
    mount()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Registrar venta' }))
    expect(await screen.findByText('Venta registrada')).toBeVisible()
    expect(storage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('Limpiar es el descarte explícito y no deja nada para recuperar', async () => {
    const user = userEvent.setup()
    const first = mount()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    first.unmount()
    mount()
    await screen.findByRole('button', { name: /^Agregar Teclado mecánico,/ })
    expect(customerBox()).toHaveValue('')
    expect(within(cart()).queryByRole('listitem')).toBeNull()
  })

  it('un rechazo definitivo del servicio conserva el borrador para corregirlo', async () => {
    postReplies = [failure(422, 'VALIDATION_ERROR')]
    const user = userEvent.setup()
    mount()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Registrar venta' }))
    await screen.findByText(/No se pudo registrar la venta/)
    expect(storage.getItem(DRAFT_KEY)).not.toBeNull()
    expect(within(cart()).getByLabelText('Cantidad de Teclado mecánico')).toHaveValue('2')
  })

  it('cerrar sesión borra el borrador y otra persona no lo recibe', async () => {
    const user = userEvent.setup()
    const first = mount()
    await fill(user)
    first.unmount()
    session.user.mockReturnValue(null)
    notifySession()
    expect(storage.getItem(DRAFT_KEY)).toBeNull()
    session.user.mockReturnValue({ sub: '550e8400-e29b-41d4-a716-4466554400aa', role: 'SALESPERSON' })
    session.sessionId.mockReturnValue('s-2')
    mount()
    await screen.findByRole('button', { name: /^Agregar Teclado mecánico,/ })
    expect(customerBox()).toHaveValue('')
    expect(within(cart()).queryByRole('listitem')).toBeNull()
  })

  it('un borrador ajeno que quedó en el almacenamiento nunca se carga', async () => {
    storage.setItem(DRAFT_KEY, JSON.stringify({ owner: JSON.stringify(['otra-persona', 'otra-sesion']), draft: { customerId: ids.customer, lines: [{ productId: ids.productA, quantity: 9 }] } }))
    mount()
    await screen.findByRole('button', { name: /^Agregar Teclado mecánico,/ })
    expect(within(cart()).queryByRole('listitem')).toBeNull()
    expect(paths('/api/v1/customers/')).toHaveLength(0)
  })
})

describe('un intento enviado no es una venta nueva', () => {
  const submit = (user: User) => user.click(screen.getByRole('button', { name: 'Registrar venta' }))

  it('tras un envío incierto y una recarga muestra el mismo intento en solo lectura y lo reintenta con la misma clave', async () => {
    postReplies = [failure(0, 'NETWORK_ERROR'), completed]
    const user = userEvent.setup()
    const first = mount()
    await fill(user, 2)
    await submit(user)
    await screen.findByText(/No se pudo confirmar si la venta fue recibida/)
    first.unmount()

    mount()
    const attempt = await screen.findByRole('region', { name: 'Intento de venta enviado' })
    expect(within(attempt).getByText(/Ana Pérez/)).toBeVisible()
    expect(within(attempt).getByText(/Teclado mecánico/)).toBeVisible()
    expect(within(attempt).getByText(/× 2/)).toBeVisible()
    // Read-only: no picker, no catalogue, no cart controls, no way to clear it.
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Agregar / })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Limpiar' })).toBeNull()
    expect(within(attempt).queryByRole('spinbutton')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Reintentar envío' }))
    await screen.findByText('Venta registrada')
    const keys = posts().map(([, options]) => options?.idempotencyKey)
    expect(keys).toEqual(['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'])
    expect(posts().map(([, options]) => JSON.stringify(options?.body))).toEqual(Array(2).fill(JSON.stringify({ customerId: ids.customer, lines: [{ productId: ids.productA, quantity: 2 }] })))
  })

  it('el reintento envía lo que se envió aunque el stock actual ya no alcance (el servidor decide)', async () => {
    postReplies = [failure(0, 'NETWORK_ERROR'), completed]
    const user = userEvent.setup()
    const first = mount()
    await fill(user, 3)
    await submit(user)
    await screen.findByText(/No se pudo confirmar/)
    first.unmount()
    products[ids.productA] = productFixture({ stock: 0 })
    mount()
    await screen.findByRole('region', { name: 'Intento de venta enviado' })
    await user.click(screen.getByRole('button', { name: 'Reintentar envío' }))
    await screen.findByText('Venta registrada')
    expect(JSON.parse(JSON.stringify(posts()[1][1]?.body))).toEqual({ customerId: ids.customer, lines: [{ productId: ids.productA, quantity: 3 }] })
    expect(posts()[1][1]?.idempotencyKey).toBe(posts()[0][1]?.idempotencyKey)
  })

  it('con una venta en seguimiento tras recargar no permite editar ni enviar otra', async () => {
    postReplies = [sagaFixture()]
    getReplies = [failure(500)]
    const user = userEvent.setup()
    const first = mount()
    await fill(user)
    await submit(user)
    await screen.findByText(/Procesando venta/)
    first.unmount()
    mount()
    const attempt = await screen.findByRole('region', { name: 'Intento de venta enviado' })
    expect(within(attempt).getByText(/Ana Pérez/)).toBeVisible()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Registrar venta' })).toBeDisabled()
    expect(posts()).toHaveLength(1)
  })

  it('si el intento no se pudo describir (servicios caídos) igualmente lo muestra con identificadores y no pierde la clave', async () => {
    postReplies = [failure(0, 'NETWORK_ERROR'), completed]
    const user = userEvent.setup()
    const first = mount()
    await fill(user)
    await submit(user)
    await screen.findByText(/No se pudo confirmar/)
    first.unmount()
    customerGet = async () => { throw failure(500) }
    delete products[ids.productA]
    mount()
    const attempt = await screen.findByRole('region', { name: 'Intento de venta enviado' })
    expect(within(attempt).getByText(/Cliente …440000/)).toBeVisible()
    expect(within(attempt).getByText(/Producto …440001/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Reintentar envío' }))
    await screen.findByText('Venta registrada')
    expect(posts()[1][1]?.idempotencyKey).toBe(posts()[0][1]?.idempotencyKey)
  })

  it('una venta confirmada limpia el intento y el borrador: la siguiente es nueva', async () => {
    const user = userEvent.setup()
    const first = mount()
    await fill(user)
    await submit(user)
    await screen.findByText('Venta registrada')
    first.unmount()
    mount()
    await screen.findByRole('button', { name: /^Agregar Teclado mecánico,/ })
    expect(screen.queryByRole('region', { name: 'Intento de venta enviado' })).toBeNull()
    expect(customerBox()).toHaveValue('')
  })
})

describe('cliente que dejó de estar disponible al registrar', () => {
  const unavailable = sagaFixture({ status: 'COMPENSATED', failedStep: 'validate-customer', completedSteps: [] })

  it('lo explica, ofrece elegir otro cliente, conserva el carrito y enfoca el selector', async () => {
    postReplies = [unavailable]
    const user = userEvent.setup()
    mount()
    await fill(user, 2)
    await user.click(screen.getByRole('button', { name: 'Registrar venta' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/El cliente no está disponible/)
    await user.click(within(alert).getByRole('button', { name: 'Elegir otro cliente' }))
    await waitFor(() => expect(customerBox()).toHaveFocus())
    expect(customerBox()).toHaveValue('')
    expect(screen.queryByText('Ana Pérez')).toBeNull()
    expect(within(cart()).getByLabelText('Cantidad de Teclado mecánico')).toHaveValue('2')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(JSON.parse(storage.getItem(DRAFT_KEY)!).draft).toEqual({ customerId: null, lines: [{ productId: ids.productA, quantity: 2 }] })
  })

  it('tras elegir otro cliente la venta se registra como un intento nuevo (otra clave)', async () => {
    postReplies = [unavailable, completed]
    const user = userEvent.setup()
    mount()
    await fill(user, 2)
    await user.click(screen.getByRole('button', { name: 'Registrar venta' }))
    await user.click(await screen.findByRole('button', { name: 'Elegir otro cliente' }))
    await user.type(customerBox(), 'ana')
    await user.click(await screen.findByRole('option', { name: /Ana Pérez/ }))
    await user.click(screen.getByRole('button', { name: 'Registrar venta' }))
    await screen.findByText('Venta registrada')
    expect(posts()).toHaveLength(2)
    expect(posts()[1][1]?.idempotencyKey).not.toBe(posts()[0][1]?.idempotencyKey)
  })

  it('un rechazo por stock revalida el carrito con el stock actual y avisa lo que cambió', async () => {
    postReplies = [sagaFixture({ status: 'COMPENSATED', failedStep: 'reserve-stock', completedSteps: ['validate-customer'] })]
    const user = userEvent.setup()
    mount()
    await fill(user, 4)
    products[ids.productA] = productFixture({ stock: 1 })
    await user.click(screen.getByRole('button', { name: 'Registrar venta' }))
    await screen.findByText(/No hay stock suficiente/)
    await waitFor(() => expect(within(cart()).getByLabelText('Cantidad de Teclado mecánico')).toHaveValue('1'))
    expect(screen.getByRole('status', { name: 'Avisos de la venta recuperada' })).toHaveTextContent('se ajustó la cantidad de 4 a 1')
    expect(screen.getByText('Ana Pérez')).toBeVisible()
  })

  it('un rechazo por stock no ofrece cambiar de cliente', async () => {
    postReplies = [sagaFixture({ status: 'COMPENSATED', failedStep: 'reserve-stock', completedSteps: ['validate-customer'] })]
    const user = userEvent.setup()
    mount()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Registrar venta' }))
    expect(await screen.findByText(/No hay stock suficiente/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Elegir otro cliente' })).toBeNull()
  })
})
