import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ids, sagaFixture, saleFixture } from '../../test-doubles/fixtures'
import { parseSaga } from '../model/saga'
import type { RegistrationState } from '../model/sagaMachine'
import type { SaleLookup } from '../pages/useRegisterSale'
import { SagaStatus } from './SagaStatus'

const saga = (overrides = {}) => parseSaga(sagaFixture(overrides))
const completed = (): RegistrationState => ({ phase: 'completed', saga: { ...saga({ status: 'COMPLETED', saleId: ids.sale }), saleId: ids.sale } })
function setup(state: RegistrationState, sale: SaleLookup = { status: 'idle' }, canRetry = true) {
  const handlers = { onRetry: vi.fn(), onResume: vi.fn(), onDismiss: vi.fn() }
  const user = userEvent.setup()
  render(<SagaStatus state={state} sale={sale} canRetry={canRetry} {...handlers} />)
  return { user, ...handlers }
}

it('no muestra nada en reposo', () => {
  setup({ phase: 'idle' })
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('status')).toBeEmptyDOMElement()
})

it('RUNNING anuncia «Procesando venta…» y expone el código de seguimiento', () => {
  setup({ phase: 'running', sagaId: ids.saga })
  expect(screen.getByRole('status')).toHaveTextContent('Procesando venta…')
  expect(screen.getByRole('status')).toHaveTextContent(ids.saga)
  expect(screen.queryByRole('alert')).toBeNull()
})

it('COMPLETED confirma la venta, muestra el total autoritativo de Sales y enlaza al detalle', () => {
  setup(completed(), { status: 'ready', sale: saleFixture({ totalCents: 123456789 }) as never })
  const status = screen.getByRole('status')
  expect(status).toHaveTextContent('Venta registrada')
  expect(status).toHaveTextContent(/Total registrado/)
  expect(status).toHaveTextContent(/1\.234\.567,89/)
  expect(screen.getByRole('link', { name: 'Ver detalle de la venta' })).toHaveAttribute('href', `/sales/${ids.sale}`)
})

it('COMPLETED sin total todavía: lo indica sin calcularlo ni inventarlo', () => {
  setup(completed(), { status: 'loading' })
  expect(screen.getByRole('status')).toHaveTextContent('Consultando el total registrado…')
})

it('COMPLETED con Sales no disponible: la venta sigue confirmada y el total se consulta en el historial', () => {
  setup(completed(), { status: 'error' })
  expect(screen.getByRole('status')).toHaveTextContent('Venta registrada')
  expect(screen.getByRole('status')).toHaveTextContent('No se pudo consultar el total. Revísalo en el historial.')
  expect(screen.queryByRole('alert')).toBeNull()
})

it('COMPENSATED por stock usa exactamente el texto aprobado en 4 líneas', () => {
  setup({ phase: 'compensated', saga: saga({ status: 'COMPENSATED', failedStep: 'reserve-stock' }) })
  const alert = screen.getByRole('alert')
  expect([...alert.querySelectorAll('p')].map((line) => line.textContent)).toEqual([
    'No se pudo completar la venta',
    'Paso fallido: reserva de stock',
    'No hay stock suficiente para uno o más productos de la venta.',
    'Ajusta las cantidades e inténtalo de nuevo.',
  ])
  expect(alert).not.toHaveTextContent('reserve-stock')
  expect(screen.queryByText('Venta registrada')).toBeNull()
})

it.each([
  ['validate-customer', 'validación del cliente', /cliente no está disponible/],
  ['register-sale', 'registro de la venta', /no pudo registrarse/],
])('COMPENSATED en %s traduce el paso y no declara una venta registrada', (failedStep, label, copy) => {
  setup({ phase: 'compensated', saga: saga({ status: 'COMPENSATED', failedStep }) })
  const alert = screen.getByRole('alert')
  expect(alert).toHaveTextContent('No se pudo completar la venta')
  expect(alert).toHaveTextContent(`Paso fallido: ${label}`)
  expect(alert).toHaveTextContent(copy)
  expect(alert).not.toHaveTextContent(failedStep)
  expect(screen.queryByText('Venta registrada')).toBeNull()
})

it('COMPENSATED sin paso informado no inventa uno', () => {
  setup({ phase: 'compensated', saga: saga({ status: 'COMPENSATED' }) })
  expect(screen.getByRole('alert')).toHaveTextContent('No se pudo completar la venta')
  expect(screen.getByRole('alert')).not.toHaveTextContent('Paso fallido')
})

it('FAILED es una falla operativa: pide atención y no permite descartar su seguimiento', () => {
  setup({ phase: 'failed', saga: saga({ status: 'FAILED', failedStep: 'register-sale' }) })
  const alert = screen.getByRole('alert')
  expect(alert).toHaveTextContent('La venta requiere atención')
  expect(alert).toHaveTextContent(ids.saga)
  expect(alert).toHaveTextContent('No se pudo confirmar la reversión')
  expect(alert).not.toHaveTextContent(/stock (fue|se) (liberad|restaur|repuest)/i)
  expect(alert).not.toHaveTextContent(/puedes (volver|intentar)/i)
  expect(alert).not.toHaveTextContent('register-sale')
  expect(screen.queryByRole('button', { name: 'Entendido' })).toBeNull()
})

it.each([
  ['timeout', /sigue en proceso/],
  ['status-unavailable', /No se pudo consultar el estado/],
  ['invalid-response', /respuesta inesperada/],
] as const)('sin resolver (%s): no es éxito ni fracaso, conserva el código y permite consultar', async (reason, copy) => {
  const { user, onResume } = setup({ phase: 'unresolved', sagaId: ids.saga, reason })
  const alert = screen.getByRole('alert')
  expect(alert).toHaveTextContent(copy)
  expect(alert).toHaveTextContent(ids.saga)
  expect(alert).toHaveTextContent('No envíes la venta de nuevo')
  expect(alert).not.toHaveTextContent('Venta registrada')
  await user.click(screen.getByRole('button', { name: 'Consultar estado' }))
  expect(onResume).toHaveBeenCalledTimes(1)
})

describe('error de envío', () => {
  it('incierto: no se sabe si llegó; reintentar reenvía la misma solicitud sin duplicar', async () => {
    const { user, onRetry } = setup({ phase: 'submit-failed', kind: 'uncertain', traceId: 'trace-1' })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('No se pudo confirmar si la venta fue recibida')
    expect(alert).toHaveTextContent('la misma solicitud sin duplicar la venta')
    expect(alert).toHaveTextContent('Referencia: trace-1')
    expect(alert).not.toHaveTextContent(/Raw English|Network error/)
    await user.click(screen.getByRole('button', { name: 'Reintentar envío' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
  it('incierto sin formulario válido no ofrece reintento', () => {
    setup({ phase: 'submit-failed', kind: 'uncertain' }, { status: 'idle' }, false)
    expect(screen.getByRole('button', { name: 'Reintentar envío' })).toBeDisabled()
  })
  it('rechazada, sin permiso y sesión tienen mensajes distintos y sin reintento automático', () => {
    const { unmount } = render(<SagaStatus state={{ phase: 'submit-failed', kind: 'rejected' }} sale={{ status: 'idle' }} canRetry onRetry={vi.fn()} onResume={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo registrar la venta. Revisa los datos e inténtalo de nuevo.')
    unmount()
    const forbidden = render(<SagaStatus state={{ phase: 'submit-failed', kind: 'forbidden' }} sale={{ status: 'idle' }} canRetry onRetry={vi.fn()} onResume={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No tienes permiso para registrar ventas.')
    expect(screen.queryByRole('button', { name: 'Reintentar envío' })).toBeNull()
    forbidden.unmount()
    render(<SagaStatus state={{ phase: 'submit-failed', kind: 'session' }} sale={{ status: 'idle' }} canRetry onRetry={vi.fn()} onResume={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('La sesión ha finalizado. Vuelve a iniciar sesión desde SynkroTech.')
  })
})
