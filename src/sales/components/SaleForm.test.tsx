import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { apiClient } from '../../test-doubles/shellApiClient'
import { customerFixture, deferred, failure, ids, pageOf, productFixture } from '../../test-doubles/fixtures'
import { SaleForm } from './SaleForm'

const teclado = productFixture({ stock: 40 })
const raton = productFixture({ productId: ids.productB, name: 'Ratón óptico', priceCents: 5000, stock: 3 })
const agotado = productFixture({ productId: '550e8400-e29b-41d4-a716-4466554400ff', name: 'Cable HDMI', priceCents: 900, stock: 0 })
const catalogue = [teclado, raton, agotado]
const category = { categoryId: ids.category, name: 'Periféricos', active: true }

function backend() {
  apiClient.request.mockImplementation(async (path, options) => {
    const query = (options?.query ?? {}) as Record<string, unknown>
    if (path === '/api/v1/customers') {
      const document = query.identityDocument
      if (document === '1075123456') return pageOf([customerFixture()])
      if (document === '999') return pageOf([customerFixture({ active: false, name: 'Cliente Inactivo', identityDocument: '999' })])
      return pageOf([])
    }
    if (path === '/api/v1/products/categories') return { data: [category], meta: { page: 1, limit: 100, total: 1, totalPages: 1 } }
    if (path === '/api/v1/products') {
      const name = String(query.name ?? '').toLowerCase()
      return pageOf(catalogue.filter((product) => product.name.toLowerCase().includes(name)))
    }
    throw new Error(`unexpected ${path}`)
  })
}
const setup = (props: Partial<React.ComponentProps<typeof SaleForm>> = {}) => {
  const onSubmit = vi.fn()
  const onClear = vi.fn()
  const onDraftChange = vi.fn()
  const user = userEvent.setup()
  const view = render(<SaleForm pending={false} onSubmit={onSubmit} onClear={onClear} onDraftChange={onDraftChange} {...props} />)
  return { user, onSubmit, onClear, onDraftChange, ...view }
}
const customerBox = () => screen.getByRole('combobox', { name: /cliente/i })
const cart = () => screen.getByRole('region', { name: 'Venta actual' })
const tile = (name: string) => screen.findByRole('button', { name: new RegExp(`^Agregar ${name},`) })

async function pickCustomer(user: ReturnType<typeof userEvent.setup>) {
  await user.type(customerBox(), '1075123456')
  await user.click(await screen.findByRole('option', { name: /Ana Pérez/ }))
}
async function click(user: ReturnType<typeof userEvent.setup>, name: string, times = 1) {
  const button = await tile(name)
  for (let i = 0; i < times; i += 1) await user.click(button)
}

beforeEach(() => { apiClient.request.mockReset(); backend() })

it('inicia con selector de cliente, catálogo, carrito vacío y la venta sin líneas', async () => {
  setup()
  expect(customerBox()).toBeVisible()
  expect(await tile('Teclado mecánico')).toBeVisible()
  expect(within(cart()).getByText(/Aún no hay productos/)).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Agregar línea' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Registrar venta' })).toBeEnabled()
})

it('valida cliente y carrito vacío, enfoca el primer error y no llama a onSubmit', async () => {
  const { user, onSubmit } = setup()
  await tile('Teclado mecánico')
  await user.click(screen.getByRole('button', { name: 'Registrar venta' }))
  expect(screen.getByText('Selecciona un cliente.')).toBeVisible()
  expect(screen.getByText('Agrega al menos una línea.')).toBeVisible()
  expect(customerBox()).toHaveFocus()
  expect(customerBox()).toBeInvalid()
  expect(onSubmit).not.toHaveBeenCalled()
})

it('un clic agrega una unidad y los clics repetidos incrementan la misma entrada', async () => {
  const { user } = setup()
  await click(user, 'Teclado mecánico', 3)
  expect(within(cart()).getAllByRole('listitem')).toHaveLength(1)
  expect(within(cart()).getByLabelText('Cantidad de Teclado mecánico')).toHaveValue('3')
  expect(within(cart()).getByLabelText('Subtotal de Teclado mecánico')).toHaveTextContent(/376,50/)
})

it('confirma cada alta en una región de estado accesible', async () => {
  const { user } = setup()
  await click(user, 'Teclado mecánico')
  await waitFor(() => expect(screen.getAllByRole('status').some((node) => /Teclado mecánico agregado\. En la venta: 1\./.test(node.textContent ?? ''))).toBe(true))
})

it('un producto agotado no puede agregarse', async () => {
  setup()
  const out = await tile('Cable HDMI')
  expect(out).toBeDisabled()
  expect(out).toHaveAccessibleName(/Agotado/)
  expect(within(cart()).queryByRole('listitem')).toBeNull()
})

it('muestra "Quedan N" para stock bajo y bloquea cantidades sobre el stock observado', async () => {
  const { user } = setup()
  expect(await tile('Ratón óptico')).toHaveAccessibleName(/Quedan 3/)
  await click(user, 'Ratón óptico', 4)
  expect(within(cart()).getByLabelText('Cantidad de Ratón óptico')).toHaveValue('3')
  await waitFor(() => expect(screen.getAllByRole('status').some((node) => /Solo hay 3 unidades disponibles\./.test(node.textContent ?? ''))).toBe(true))
})

it('los controles menos, más, cantidad y quitar actualizan subtotal y total estimado al instante', async () => {
  const { user } = setup()
  await click(user, 'Teclado mecánico')
  const row = within(cart())
  await user.click(row.getByRole('button', { name: 'Agregar una unidad de Teclado mecánico' }))
  expect(row.getByLabelText('Cantidad de Teclado mecánico')).toHaveValue('2')
  expect(screen.getByText('Total estimado (referencial)').parentElement).toHaveTextContent(/251,00/)
  await user.clear(row.getByLabelText('Cantidad de Teclado mecánico'))
  await user.type(row.getByLabelText('Cantidad de Teclado mecánico'), '4')
  expect(screen.getByText('Total estimado (referencial)').parentElement).toHaveTextContent(/502,00/)
  await user.click(row.getByRole('button', { name: 'Quitar una unidad de Teclado mecánico' }))
  expect(row.getByLabelText('Cantidad de Teclado mecánico')).toHaveValue('3')
  await user.click(row.getByRole('button', { name: 'Quitar Teclado mecánico de la venta' }))
  expect(row.queryByRole('listitem')).toBeNull()
  expect(screen.getByText('Total estimado (referencial)').parentElement).toHaveTextContent('—')
  expect(screen.getByText(/No es el total de la venta/)).toBeVisible()
})

it('restar desde una unidad elimina la entrada', async () => {
  const { user } = setup()
  await click(user, 'Teclado mecánico')
  await user.click(within(cart()).getByRole('button', { name: 'Quitar una unidad de Teclado mecánico' }))
  expect(within(cart()).queryByRole('listitem')).toBeNull()
})

it('el filtro consulta el servicio por nombre y las categorías vienen de la API', async () => {
  const { user } = setup()
  await tile('Teclado mecánico')
  expect(await screen.findByRole('button', { name: 'Periféricos' })).toHaveAttribute('aria-pressed', 'false')
  await user.type(screen.getByLabelText('Buscar producto'), 'rat')
  await waitFor(() => expect(apiClient.request).toHaveBeenCalledWith('/api/v1/products', expect.objectContaining({ query: expect.objectContaining({ name: 'rat', active: true, limit: 24 }) })))
  expect(await tile('Ratón óptico')).toBeVisible()
  await waitFor(() => expect(screen.queryByRole('button', { name: /^Agregar Teclado/ })).toBeNull())
  await user.click(screen.getByRole('button', { name: 'Periféricos' }))
  await waitFor(() => expect(apiClient.request).toHaveBeenCalledWith('/api/v1/products', expect.objectContaining({ query: expect.objectContaining({ categoryId: ids.category }) })))
})

it('un error del catálogo ofrece reintento en español', async () => {
  apiClient.request.mockImplementation(async (path) => {
    if (path === '/api/v1/products') throw failure(500)
    return { data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } }
  })
  const { user } = setup()
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el catálogo.')
  expect(screen.queryByText(/Raw English/)).toBeNull()
  backend()
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await tile('Teclado mecánico')).toBeVisible()
})

it('tras elegir el cliente el foco pasa al filtro del catálogo y se puede cambiar de cliente', async () => {
  const { user } = setup()
  await tile('Teclado mecánico')
  await pickCustomer(user)
  await waitFor(() => expect(screen.getByLabelText('Buscar producto')).toHaveFocus())
  expect(screen.getByText('Ana Pérez')).toBeVisible()
  expect(screen.getByText(/1075123456/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Cambiar cliente' }))
  expect(customerBox()).toBeVisible()
})

it('entrega solo cliente y líneas válidas (sin precios) y notifica el borrador vigente', async () => {
  const { user, onSubmit, onDraftChange } = setup()
  await pickCustomer(user)
  await click(user, 'Teclado mecánico', 2)
  await user.click(screen.getByRole('button', { name: 'Registrar venta' }))
  const request = { customerId: ids.customer, lines: [{ productId: ids.productA, quantity: 2 }] }
  expect(onSubmit).toHaveBeenCalledWith(request)
  expect(onDraftChange).toHaveBeenLastCalledWith(request)
})

it('pendiente: deshabilita el envío, el carrito y el catálogo', async () => {
  setup({ pending: true })
  expect(screen.getByRole('button', { name: /Registrando venta/ })).toBeDisabled()
  expect(customerBox()).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Limpiar' })).toBeDisabled()
  expect(await tile('Teclado mecánico')).toBeDisabled()
})

it('conserva cliente, productos y cantidades al volver de pendiente (rechazo de negocio)', async () => {
  const { user, rerender, onSubmit, onClear, onDraftChange } = setup()
  await pickCustomer(user)
  await click(user, 'Teclado mecánico', 5)
  rerender(<SaleForm pending onSubmit={onSubmit} onClear={onClear} onDraftChange={onDraftChange} />)
  rerender(<SaleForm pending={false} onSubmit={onSubmit} onClear={onClear} onDraftChange={onDraftChange} />)
  expect(screen.getByText('Ana Pérez')).toBeVisible()
  expect(within(cart()).getByLabelText('Cantidad de Teclado mecánico')).toHaveValue('5')
})

it('Limpiar restablece el formulario y avisa al padre', async () => {
  const { user, onClear } = setup()
  await pickCustomer(user)
  await click(user, 'Teclado mecánico')
  await user.click(screen.getByRole('button', { name: 'Limpiar' }))
  expect(onClear).toHaveBeenCalledTimes(1)
  expect(customerBox()).toHaveValue('')
  expect(within(cart()).queryByRole('listitem')).toBeNull()
})

it('cancela las consultas pendientes al desmontar', async () => {
  const slow = deferred<unknown>()
  const signals: AbortSignal[] = []
  apiClient.request.mockImplementation((_path, options) => { signals.push(options!.signal!); return slow.promise })
  const { unmount } = setup()
  await waitFor(() => expect(signals.length).toBeGreaterThan(0))
  unmount()
  expect(signals.every((signal) => signal.aborted)).toBe(true)
  slow.resolve(pageOf([]))
})
