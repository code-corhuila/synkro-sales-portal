import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { apiClient } from '../../test-doubles/shellApiClient'
import { customerFixture, deferred, failure, ids, pageOf, productFixture } from '../../test-doubles/fixtures'
import { SaleForm } from './SaleForm'

const productB = productFixture({ productId: ids.productB, name: 'Ratón óptico', priceCents: 5000 })

function backend() {
  apiClient.request.mockImplementation(async (path, options) => {
    if (path === '/api/v1/customers') {
      const document = options?.query?.identityDocument
      if (document === '1075123456') return pageOf([customerFixture()])
      if (document === '999') return pageOf([customerFixture({ active: false, name: 'Cliente Inactivo', identityDocument: '999' })])
      return pageOf([])
    }
    if (path === '/api/v1/products') {
      const name = String(options?.query?.name).toLowerCase()
      return pageOf([productFixture(), productB].filter((product) => product.name.toLowerCase().includes(name)))
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
const line = (number: number) => screen.getByRole('group', { name: `Línea ${number}` })

async function pickCustomer(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Documento del cliente'), '1075123456')
  await user.click(screen.getByRole('button', { name: 'Buscar cliente' }))
  await user.click(await screen.findByRole('button', { name: 'Seleccionar cliente' }))
}
async function pickProduct(user: ReturnType<typeof userEvent.setup>, number: number, term: string, option: string) {
  const group = line(number)
  await user.type(within(group).getByLabelText('Buscar producto'), term)
  await user.click(within(group).getByRole('button', { name: 'Buscar producto' }))
  await user.selectOptions(await within(group).findByLabelText('Producto'), option)
}

beforeEach(() => { apiClient.request.mockReset(); backend() })

it('inicia con selector de cliente, una línea vacía y sin consultar catálogos', () => {
  setup()
  expect(screen.getByLabelText('Documento del cliente')).toBeVisible()
  expect(screen.getAllByRole('group', { name: /^Línea/ })).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Registrar venta' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Quitar línea 1' })).toBeDisabled()
  expect(apiClient.request).not.toHaveBeenCalled()
})

it('valida junto a cada campo, enfoca el primer error y no llama al backend ni a onSubmit', async () => {
  const { user, onSubmit } = setup()
  await user.click(screen.getByRole('button', { name: 'Registrar venta' }))
  expect(screen.getByText('Selecciona un cliente.')).toBeVisible()
  expect(within(line(1)).getByText('Selecciona un producto.')).toBeVisible()
  expect(within(line(1)).getByText('Ingresa una cantidad entera mayor que cero.')).toBeVisible()
  expect(screen.getByLabelText('Documento del cliente')).toHaveFocus()
  expect(screen.getByLabelText('Documento del cliente')).toBeInvalid()
  expect(onSubmit).not.toHaveBeenCalled()
  expect(apiClient.request).not.toHaveBeenCalled()
})

it('busca el cliente por documento exacto y solo permite seleccionar uno activo', async () => {
  const { user } = setup()
  await user.type(screen.getByLabelText('Documento del cliente'), '999')
  await user.click(screen.getByRole('button', { name: 'Buscar cliente' }))
  expect(await screen.findByText(/Cliente Inactivo/)).toBeVisible()
  expect(screen.getByText(/está inactivo/)).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Seleccionar cliente' })).toBeNull()
  expect(apiClient.request).toHaveBeenCalledWith('/api/v1/customers', expect.objectContaining({ query: { identityDocument: '999', page: 1, limit: 5 } }))
})

it('informa cuando no existe el documento y permite cambiar el cliente elegido', async () => {
  const { user } = setup()
  await user.type(screen.getByLabelText('Documento del cliente'), '000')
  await user.click(screen.getByRole('button', { name: 'Buscar cliente' }))
  expect(await screen.findByText('No se encontró un cliente con ese documento.')).toBeVisible()
  await user.clear(screen.getByLabelText('Documento del cliente'))
  await pickCustomer(user)
  expect(screen.getByText('Ana Pérez')).toBeVisible()
  expect(screen.getByText(/1075123456/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Cambiar cliente' }))
  expect(screen.getByLabelText('Documento del cliente')).toBeVisible()
})

it('muestra un error de búsqueda de cliente en español sin texto crudo y conserva el documento', async () => {
  apiClient.request.mockRejectedValueOnce(failure(0, 'NETWORK_ERROR'))
  const { user } = setup()
  await user.type(screen.getByLabelText('Documento del cliente'), '1075123456')
  await user.click(screen.getByRole('button', { name: 'Buscar cliente' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo buscar el cliente.')
  expect(screen.queryByText(/Raw English/)).toBeNull()
  expect(screen.getByLabelText('Documento del cliente')).toHaveValue('1075123456')
})

it('busca productos por nombre acotado, calcula subtotal y total estimado con precios de catálogo', async () => {
  const { user } = setup()
  await pickProduct(user, 1, 'teclado', 'Teclado mecánico')
  expect(apiClient.request).toHaveBeenCalledWith('/api/v1/products', expect.objectContaining({ query: { name: 'teclado', active: true, page: 1, limit: 10 } }))
  await user.type(within(line(1)).getByLabelText('Cantidad'), '2')
  expect(within(line(1)).getByText(/251,00/)).toBeVisible()
  expect(screen.getByText('Total estimado (referencial)')).toBeVisible()
  expect(screen.getByTestId('estimated-total')).toHaveTextContent(/251,00/)
  expect(screen.getByText(/No es el total de la venta/)).toBeVisible()
})

it('no muestra total estimado hasta que todas las líneas son confiables', async () => {
  const { user } = setup()
  await user.click(screen.getByRole('button', { name: 'Agregar línea' }))
  await pickProduct(user, 1, 'teclado', 'Teclado mecánico')
  await user.type(within(line(1)).getByLabelText('Cantidad'), '1')
  expect(screen.getByTestId('estimated-total')).toHaveTextContent('—')
})

it('agrega y quita líneas, y bloquea agregar la línea 101', async () => {
  const { user } = setup()
  await user.click(screen.getByRole('button', { name: 'Agregar línea' }))
  expect(screen.getAllByRole('group', { name: /^Línea/ })).toHaveLength(2)
  await user.click(screen.getByRole('button', { name: 'Quitar línea 2' }))
  expect(screen.getAllByRole('group', { name: /^Línea/ })).toHaveLength(1)
  for (let i = 0; i < 99; i += 1) await user.click(screen.getByRole('button', { name: 'Agregar línea' }))
  expect(screen.getAllByRole('group', { name: /^Línea/ })).toHaveLength(100)
  expect(screen.getByRole('button', { name: 'Agregar línea' })).toBeDisabled()
  expect(screen.getByText('Una venta admite hasta 100 líneas.')).toBeVisible()
}, 60000)

it('rechaza cantidades cero o negativas junto al campo', async () => {
  const { user, onSubmit } = setup()
  await pickCustomer(user)
  await pickProduct(user, 1, 'teclado', 'Teclado mecánico')
  const quantity = within(line(1)).getByLabelText('Cantidad')
  await user.type(quantity, '0')
  await user.click(screen.getByRole('button', { name: 'Registrar venta' }))
  expect(within(line(1)).getByText('Ingresa una cantidad entera mayor que cero.')).toBeVisible()
  expect(quantity).toHaveFocus()
  await user.clear(quantity)
  await user.type(quantity, '-3')
  await user.click(screen.getByRole('button', { name: 'Registrar venta' }))
  expect(within(line(1)).getByText('Ingresa una cantidad entera mayor que cero.')).toBeVisible()
  expect(onSubmit).not.toHaveBeenCalled()
})

it('entrega solo cliente y líneas válidas y notifica el borrador vigente', async () => {
  const { user, onSubmit, onDraftChange } = setup()
  await pickCustomer(user)
  await pickProduct(user, 1, 'teclado', 'Teclado mecánico')
  await user.type(within(line(1)).getByLabelText('Cantidad'), '2')
  await user.click(screen.getByRole('button', { name: 'Registrar venta' }))
  const request = { customerId: ids.customer, lines: [{ productId: ids.productA, quantity: 2 }] }
  expect(onSubmit).toHaveBeenCalledWith(request)
  expect(onDraftChange).toHaveBeenLastCalledWith(request)
})

it('rechaza el mismo producto en dos líneas', async () => {
  const { user, onSubmit } = setup()
  await pickCustomer(user)
  await user.click(screen.getByRole('button', { name: 'Agregar línea' }))
  for (const number of [1, 2]) {
    await pickProduct(user, number, 'teclado', 'Teclado mecánico')
    await user.type(within(line(number)).getByLabelText('Cantidad'), '1')
  }
  await user.click(screen.getByRole('button', { name: 'Registrar venta' }))
  expect(within(line(2)).getByText('Este producto ya está en otra línea.')).toBeVisible()
  expect(onSubmit).not.toHaveBeenCalled()
})

it('pendiente: deshabilita el envío y los campos, y anuncia el progreso', () => {
  setup({ pending: true })
  expect(screen.getByRole('button', { name: /Registrando venta/ })).toBeDisabled()
  expect(screen.getByLabelText('Documento del cliente')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Agregar línea' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Limpiar' })).toBeDisabled()
})

it('conserva cliente, productos y cantidades al volver de pendiente (rechazo de negocio)', async () => {
  const { user, rerender, onSubmit, onClear, onDraftChange } = setup()
  await pickCustomer(user)
  await pickProduct(user, 1, 'teclado', 'Teclado mecánico')
  await user.type(within(line(1)).getByLabelText('Cantidad'), '5')
  rerender(<SaleForm pending onSubmit={onSubmit} onClear={onClear} onDraftChange={onDraftChange} />)
  rerender(<SaleForm pending={false} onSubmit={onSubmit} onClear={onClear} onDraftChange={onDraftChange} />)
  expect(screen.getByText('Ana Pérez')).toBeVisible()
  expect(within(line(1)).getByLabelText('Cantidad')).toHaveValue('5')
  expect(within(line(1)).getByLabelText('Producto')).toHaveValue(ids.productA)
})

it('Limpiar restablece el formulario y avisa al padre', async () => {
  const { user, onClear } = setup()
  await pickCustomer(user)
  await pickProduct(user, 1, 'teclado', 'Teclado mecánico')
  await user.click(screen.getByRole('button', { name: 'Limpiar' }))
  expect(onClear).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Documento del cliente')).toHaveValue('')
  expect(within(line(1)).queryByLabelText('Producto')).toBeNull()
})

it('cancela la búsqueda pendiente al desmontar', async () => {
  const slow = deferred<unknown>()
  const signals: AbortSignal[] = []
  apiClient.request.mockImplementation((_path, options) => { signals.push(options!.signal!); return slow.promise })
  const { user, unmount } = setup()
  await user.type(screen.getByLabelText('Documento del cliente'), '1075123456')
  await user.click(screen.getByRole('button', { name: 'Buscar cliente' }))
  await waitFor(() => expect(signals).toHaveLength(1))
  unmount()
  expect(signals[0].aborted).toBe(true)
  slow.resolve(pageOf([customerFixture()]))
})
