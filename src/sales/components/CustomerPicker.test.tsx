import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { deferred, ids } from '../../test-doubles/fixtures'
import type { CustomerChoice, CustomerSearchResult, CustomerSuggestion } from '../model/customer'
import { CustomerPicker, CUSTOMER_DEBOUNCE_MS, CUSTOMER_SUGGESTION_LIMIT } from './CustomerPicker'

const suggestion = (overrides: Partial<CustomerSuggestion> = {}): CustomerSuggestion => ({
  customerId: ids.customer, name: 'Ana Pérez', identityDocument: '1075123456', active: true, match: 'NAME', ...overrides,
})
const ana = suggestion()
const luis = suggestion({ customerId: '550e8400-e29b-41d4-a716-446655440010', name: 'Luis Gómez', identityDocument: '1075999000' })
const inactive = suggestion({ customerId: '550e8400-e29b-41d4-a716-446655440011', name: 'Marta Inactiva', identityDocument: '1075000111', active: false })
const result = (data: CustomerSuggestion[], hasMore = false): CustomerSearchResult => ({ data, hasMore })
const choice = ({ customerId, name, identityDocument }: CustomerSuggestion): CustomerChoice => ({ customerId, name, identityDocument })

type Search = (query: string, signal: AbortSignal) => Promise<CustomerSearchResult>
function setup(search: Search, props: { customer?: CustomerChoice | null } = {}) {
  const onSelect = vi.fn()
  const user = userEvent.setup()
  render(<CustomerPicker customer={props.customer ?? null} onSelect={onSelect} search={search} />)
  return { user, onSelect }
}
const box = () => screen.getByRole('combobox', { name: /cliente/i })

it('espera 200 ms antes de consultar y no consulta con el campo vacío', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    const search = vi.fn().mockResolvedValue(result([ana]))
    setup(search)
    fireEvent.change(box(), { target: { value: '1075' } })
    vi.advanceTimersByTime(CUSTOMER_DEBOUNCE_MS - 1)
    expect(search).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    await waitFor(() => expect(search).toHaveBeenCalledWith('1075', expect.any(AbortSignal)))
    fireEvent.change(box(), { target: { value: '   ' } })
    vi.advanceTimersByTime(500)
    expect(search).toHaveBeenCalledTimes(1)
  } finally { vi.useRealTimers() }
})

it('el debounce son 200 ms y escribir seguido consulta una sola vez con el último texto', async () => {
  expect(CUSTOMER_DEBOUNCE_MS).toBe(200)
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    const search = vi.fn().mockResolvedValue(result([ana]))
    setup(search)
    fireEvent.change(box(), { target: { value: 'an' } })
    vi.advanceTimersByTime(150)
    fireEvent.change(box(), { target: { value: 'ana' } })
    vi.advanceTimersByTime(150)
    expect(search).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60)
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1))
    expect(search).toHaveBeenCalledWith('ana', expect.any(AbortSignal))
  } finally { vi.useRealTimers() }
})

it('un solo carácter no consulta: pide al menos dos y lo dice en la ayuda', async () => {
  const search = vi.fn().mockResolvedValue(result([]))
  const { user } = setup(search)
  await user.type(box(), 'a')
  await new Promise((resolve) => setTimeout(resolve, CUSTOMER_DEBOUNCE_MS + 80))
  expect(search).not.toHaveBeenCalled()
  expect(screen.getByText(/al menos 2 caracteres/i)).toBeVisible()
  await user.type(box(), 'n')
  await waitFor(() => expect(search).toHaveBeenCalledWith('an', expect.any(AbortSignal)))
})

it('recorta el texto antes de consultar y no cuenta los espacios', async () => {
  const search = vi.fn().mockResolvedValue(result([ana]))
  const { user } = setup(search)
  await user.type(box(), '  an  ')
  await waitFor(() => expect(search).toHaveBeenCalledWith('an', expect.any(AbortSignal)))
})

it('muestra como máximo cinco sugerencias', async () => {
  const many = Array.from({ length: 9 }, (_, i) => suggestion({ customerId: `550e8400-e29b-41d4-a716-4466554401${i}0`, name: `Cliente ${i}`, identityDocument: `10${i}` }))
  const { user } = setup(vi.fn().mockResolvedValue(result(many)))
  await user.type(box(), '10')
  expect(await screen.findAllByRole('option')).toHaveLength(CUSTOMER_SUGGESTION_LIMIT)
  expect(CUSTOMER_SUGGESTION_LIMIT).toBe(5)
})

it('cuando hay más coincidencias lo dice y pide afinar la búsqueda', async () => {
  const { user } = setup(vi.fn().mockResolvedValue(result([ana, luis], true)))
  await user.type(box(), 'pe')
  await screen.findAllByRole('option')
  expect(screen.getByText(/Hay más coincidencias/)).toBeVisible()
})

it('sin más coincidencias no muestra ese aviso', async () => {
  const { user } = setup(vi.fn().mockResolvedValue(result([ana])))
  await user.type(box(), 'an')
  await screen.findByRole('option')
  expect(screen.queryByText(/Hay más coincidencias/)).toBeNull()
})

it('muestra nombre y documento de cada sugerencia (sin contactos)', async () => {
  const { user } = setup(vi.fn().mockResolvedValue(result([ana])))
  await user.type(box(), 'an')
  const option = await screen.findByRole('option', { name: /Ana Pérez/ })
  expect(option).toHaveTextContent('Documento 1075123456')
})

it('flechas, Enter y Escape operan la lista', async () => {
  const { user, onSelect } = setup(vi.fn().mockResolvedValue(result([ana, luis])))
  await user.type(box(), 'an')
  await screen.findAllByRole('option')
  await user.keyboard('{ArrowDown}{ArrowDown}')
  expect(box()).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1].id)
  await user.keyboard('{ArrowUp}{Enter}')
  expect(onSelect).toHaveBeenCalledWith(choice(ana))
})

it('la flecha arriba desde el inicio da la vuelta a la última opción', async () => {
  const { user } = setup(vi.fn().mockResolvedValue(result([ana, luis])))
  await user.type(box(), 'an')
  await screen.findAllByRole('option')
  await user.keyboard('{ArrowUp}')
  expect(box()).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1].id)
})

it('Escape cierra la lista sin seleccionar', async () => {
  const { user, onSelect } = setup(vi.fn().mockResolvedValue(result([ana])))
  await user.type(box(), '1075')
  await screen.findByRole('option')
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('option')).toBeNull()
  expect(box()).toHaveAttribute('aria-expanded', 'false')
  expect(onSelect).not.toHaveBeenCalled()
})

it('Enter con un documento exacto selecciona a ese cliente sin elegir en la lista', async () => {
  const exact = suggestion({ match: 'DOCUMENT_EXACT' })
  const { user, onSelect } = setup(vi.fn().mockResolvedValue(result([exact, luis])))
  await user.type(box(), '1075123456')
  await screen.findAllByRole('option')
  await user.keyboard('{Enter}')
  expect(onSelect).toHaveBeenCalledWith(choice(exact))
})

it('Enter solo selecciona por documento si la coincidencia es DOCUMENT_EXACT', async () => {
  // Same text as a document, but the service says it matched by prefix: nothing is chosen for the person.
  const prefix = suggestion({ match: 'DOCUMENT_PREFIX', identityDocument: '1075123456' })
  const { user, onSelect } = setup(vi.fn().mockResolvedValue(result([prefix])))
  await user.type(box(), '1075123456')
  await screen.findAllByRole('option')
  await user.keyboard('{Enter}')
  expect(onSelect).not.toHaveBeenCalled()
})

it('Enter con varias coincidencias DOCUMENT_EXACT no elige a ninguna: la persona decide en la lista', async () => {
  // The contract promises at most one exact document match; if the service ever answers several, the first one is not a safe default.
  const first = suggestion({ match: 'DOCUMENT_EXACT', identityDocument: 'ABC123' })
  const second = suggestion({ customerId: '550e8400-e29b-41d4-a716-446655440012', name: 'Ana Pérez (otra)', match: 'DOCUMENT_EXACT', identityDocument: 'abc123' })
  const { user, onSelect } = setup(vi.fn().mockResolvedValue(result([first, second])))
  await user.type(box(), 'abc123')
  await screen.findAllByRole('option')
  await user.keyboard('{Enter}')
  expect(onSelect).not.toHaveBeenCalled()
  expect(screen.getAllByRole('option')).toHaveLength(2)
  await user.keyboard('{ArrowDown}{Enter}')
  expect(onSelect).toHaveBeenCalledWith(choice(first))
})

it('Enter sin coincidencia exacta ni opción activa no selecciona a nadie', async () => {
  const { user, onSelect } = setup(vi.fn().mockResolvedValue(result([ana, luis])))
  await user.type(box(), '1075')
  await screen.findAllByRole('option')
  await user.keyboard('{Enter}')
  expect(onSelect).not.toHaveBeenCalled()
})

it('hacer clic en una sugerencia la selecciona', async () => {
  const { user, onSelect } = setup(vi.fn().mockResolvedValue(result([ana, luis])))
  await user.type(box(), 'an')
  await user.click(await screen.findByRole('option', { name: /Luis Gómez/ }))
  expect(onSelect).toHaveBeenCalledWith(choice(luis))
})

it('defensa: aunque el servicio devolviera un cliente inactivo, no puede elegirse', async () => {
  const { user, onSelect } = setup(vi.fn().mockResolvedValue(result([inactive])))
  await user.type(box(), '1075000111')
  const option = await screen.findByRole('option', { name: /Marta Inactiva/ })
  expect(option).toHaveAttribute('aria-disabled', 'true')
  await user.click(option)
  await user.keyboard('{Enter}')
  expect(onSelect).not.toHaveBeenCalled()
})

it('una respuesta anterior tardía no reemplaza a la vigente', async () => {
  const slow = deferred<CustomerSearchResult>()
  const search = vi.fn().mockImplementationOnce(() => slow.promise).mockResolvedValueOnce(result([luis]))
  const { user } = setup(search)
  await user.type(box(), 'an')
  await waitFor(() => expect(search).toHaveBeenCalledTimes(1))
  await user.type(box(), 'b')
  expect(await screen.findByRole('option', { name: /Luis Gómez/ })).toBeVisible()
  slow.resolve(result([ana]))
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(screen.queryByRole('option', { name: /Ana Pérez/ })).toBeNull()
})

it('cancela la consulta en vuelo cuando el texto cambia', async () => {
  const signals: AbortSignal[] = []
  const search = vi.fn((_query: string, signal: AbortSignal) => { signals.push(signal); return new Promise<CustomerSearchResult>(() => {}) })
  const { user } = setup(search)
  await user.type(box(), 'an')
  await waitFor(() => expect(signals).toHaveLength(1))
  await user.type(box(), 'a')
  await waitFor(() => expect(signals).toHaveLength(2))
  expect(signals[0].aborted).toBe(true)
  expect(signals[1].aborted).toBe(false)
})

it('al borrar el texto se descarta la respuesta pendiente y desaparecen las sugerencias', async () => {
  const slow = deferred<CustomerSearchResult>()
  const { user } = setup(vi.fn().mockReturnValue(slow.promise))
  await user.type(box(), 'an')
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Buscando/))
  await user.clear(box())
  slow.resolve(result([ana]))
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(screen.queryByRole('option')).toBeNull()
  expect(screen.queryByText(/Buscando/)).toBeNull()
})

it('muestra el estado de carga mientras espera la respuesta', async () => {
  const slow = deferred<CustomerSearchResult>()
  const { user } = setup(vi.fn().mockReturnValue(slow.promise))
  await user.type(box(), 'an')
  expect(await screen.findByText('Buscando cliente…')).toBeVisible()
  slow.resolve(result([ana]))
  await screen.findByRole('option')
  expect(screen.queryByText('Buscando cliente…')).toBeNull()
})

it('distingue error de ausencia de resultados y el error ofrece reintentar', async () => {
  const search = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(result([ana]))
  const { user } = setup(search)
  await user.type(box(), 'an')
  expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo buscar/)
  expect(screen.queryByText(/No se encontraron clientes/)).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Reintentar búsqueda' }))
  expect(await screen.findByRole('option', { name: /Ana Pérez/ })).toBeVisible()
  expect(search).toHaveBeenCalledTimes(2)
  expect(search).toHaveBeenLastCalledWith('an', expect.any(AbortSignal))
})

it('sin resultados lo dice, sin confundirlo con un error', async () => {
  const { user } = setup(vi.fn().mockResolvedValue(result([])))
  await user.type(box(), 'zz')
  expect(await screen.findByText(/No se encontraron clientes/)).toBeVisible()
  expect(screen.queryByRole('alert')).toBeNull()
})

it('tras seleccionar muestra nombre y documento con la acción Cambiar cliente', async () => {
  const onSelect = vi.fn()
  const user = userEvent.setup()
  render(<CustomerPicker customer={choice(ana)} onSelect={onSelect} search={vi.fn()} />)
  expect(screen.getByText('Ana Pérez')).toBeVisible()
  expect(screen.getByText(/1075123456/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Cambiar cliente' }))
  expect(onSelect).toHaveBeenCalledWith(null)
})

it('ofrece crear un cliente navegando en la misma pestaña: el borrador de la venta es el que la conserva', () => {
  setup(vi.fn())
  const link = screen.getByRole('link', { name: /Crear cliente/ })
  expect(link).toHaveAttribute('href', '/customers')
  expect(link).not.toHaveAttribute('target')
})

it('el campo limita el texto a 100 caracteres, el máximo del contrato', () => {
  setup(vi.fn())
  expect(box()).toHaveAttribute('maxlength', '100')
})
