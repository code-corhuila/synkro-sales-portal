import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { customerFixture, deferred } from '../../test-doubles/fixtures'
import type { Customer } from '../model/customer'
import { CustomerPicker, CUSTOMER_SUGGESTION_LIMIT } from './CustomerPicker'

const ana = customerFixture()
const luis = customerFixture({ customerId: '550e8400-e29b-41d4-a716-446655440010', name: 'Luis Gómez', identityDocument: '1075999000' })
const inactive = customerFixture({ customerId: '550e8400-e29b-41d4-a716-446655440011', name: 'Marta Inactiva', identityDocument: '1075000111', active: false })

function setup(search: (term: string, signal: AbortSignal) => Promise<Customer[]>, props: { customer?: Customer | null } = {}) {
  const onSelect = vi.fn()
  const user = userEvent.setup()
  render(<CustomerPicker customer={props.customer ?? null} onSelect={onSelect} search={search} />)
  return { user, onSelect }
}
const box = () => screen.getByRole('combobox', { name: /cliente/i })

it('espera 200 ms antes de consultar y no consulta con el campo vacío', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    const search = vi.fn().mockResolvedValue([ana])
    setup(search)
    fireEvent.change(box(), { target: { value: '1075' } })
    vi.advanceTimersByTime(199)
    expect(search).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    await waitFor(() => expect(search).toHaveBeenCalledWith('1075', expect.any(AbortSignal)))
    fireEvent.change(box(), { target: { value: '   ' } })
    vi.advanceTimersByTime(500)
    expect(search).toHaveBeenCalledTimes(1)
  } finally { vi.useRealTimers() }
})

it('muestra como máximo cinco sugerencias', async () => {
  const many = Array.from({ length: 9 }, (_, i) => customerFixture({ customerId: `550e8400-e29b-41d4-a716-4466554401${i}0`, name: `Cliente ${i}`, identityDocument: `10${i}` }))
  const { user } = setup(vi.fn().mockResolvedValue(many))
  await user.type(box(), '10')
  expect(await screen.findAllByRole('option')).toHaveLength(CUSTOMER_SUGGESTION_LIMIT)
  expect(CUSTOMER_SUGGESTION_LIMIT).toBe(5)
})

it('flechas, Enter y Escape operan la lista', async () => {
  const { user, onSelect } = setup(vi.fn().mockResolvedValue([ana, luis]))
  await user.type(box(), 'a')
  await screen.findAllByRole('option')
  await user.keyboard('{ArrowDown}{ArrowDown}')
  expect(box()).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1].id)
  await user.keyboard('{ArrowUp}{Enter}')
  expect(onSelect).toHaveBeenCalledWith(ana)
})

it('Escape cierra la lista sin seleccionar', async () => {
  const { user, onSelect } = setup(vi.fn().mockResolvedValue([ana]))
  await user.type(box(), '1075')
  await screen.findByRole('option')
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('option')).toBeNull()
  expect(box()).toHaveAttribute('aria-expanded', 'false')
  expect(onSelect).not.toHaveBeenCalled()
})

it('Enter con un documento exacto selecciona al cliente sin elegir en la lista', async () => {
  const { user, onSelect } = setup(vi.fn().mockResolvedValue([luis, ana]))
  await user.type(box(), '1075123456')
  await screen.findAllByRole('option')
  await user.keyboard('{Enter}')
  expect(onSelect).toHaveBeenCalledWith(ana)
})

it('Enter sin coincidencia exacta ni opción activa no selecciona a nadie', async () => {
  const { user, onSelect } = setup(vi.fn().mockResolvedValue([ana, luis]))
  await user.type(box(), '1075')
  await screen.findAllByRole('option')
  await user.keyboard('{Enter}')
  expect(onSelect).not.toHaveBeenCalled()
})

it('un cliente inactivo se muestra pero no puede elegirse', async () => {
  const { user, onSelect } = setup(vi.fn().mockResolvedValue([inactive]))
  await user.type(box(), '1075000111')
  const option = await screen.findByRole('option', { name: /Marta Inactiva/ })
  expect(option).toHaveAttribute('aria-disabled', 'true')
  expect(option).toHaveTextContent(/inactivo/i)
  await user.click(option)
  await user.keyboard('{Enter}')
  expect(onSelect).not.toHaveBeenCalled()
})

it('una respuesta anterior tardía no reemplaza a la vigente', async () => {
  const slow = deferred<Customer[]>()
  const search = vi.fn().mockImplementationOnce(() => slow.promise).mockResolvedValueOnce([luis])
  const { user } = setup(search)
  await user.type(box(), 'a')
  await waitFor(() => expect(search).toHaveBeenCalledTimes(1))
  await user.type(box(), 'b')
  expect(await screen.findByRole('option', { name: /Luis Gómez/ })).toBeVisible()
  slow.resolve([ana])
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(screen.queryByRole('option', { name: /Ana Pérez/ })).toBeNull()
})

it('distingue error de ausencia de resultados', async () => {
  const { user } = setup(vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce([]))
  await user.type(box(), '1')
  expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo buscar/)
  await user.type(box(), '2')
  expect(await screen.findByText(/No se encontraron clientes/)).toBeVisible()
})

it('tras seleccionar muestra nombre y documento con la acción Cambiar cliente', async () => {
  const onSelect = vi.fn()
  const user = userEvent.setup()
  render(<CustomerPicker customer={ana} onSelect={onSelect} search={vi.fn()} />)
  expect(screen.getByText('Ana Pérez')).toBeVisible()
  expect(screen.getByText(/1075123456/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Cambiar cliente' }))
  expect(onSelect).toHaveBeenCalledWith(null)
})

it('ofrece crear un cliente en otra pestaña para no perder la venta en curso', () => {
  setup(vi.fn())
  const link = screen.getByRole('link', { name: /Crear cliente/ })
  expect(link).toHaveAttribute('href', '/customers')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
})
