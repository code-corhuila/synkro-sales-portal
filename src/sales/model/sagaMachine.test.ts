import { initialRegistration, registrationReducer, isPending, type RegistrationState } from './sagaMachine'
import { parseSaga, STEP_LABELS } from './saga'
import { ids, sagaFixture } from '../../test-doubles/fixtures'

const saga = (overrides = {}) => parseSaga(sagaFixture(overrides))
const completed = saga({ status: 'COMPLETED', completedSteps: ['validate-customer', 'reserve-stock', 'register-sale'], saleId: ids.sale })

describe('parseSaga', () => {
  it('acepta la representación pública documentada', () => {
    expect(parseSaga(sagaFixture({ status: 'COMPENSATED', failedStep: 'reserve-stock', completedSteps: ['validate-customer'] })).failedStep).toBe('reserve-stock')
  })
  it.each([
    ['estado desconocido', { status: 'PENDING' }],
    ['sagaId inválido', { sagaId: 'x' }],
    ['tipo distinto', { sagaType: 'other' }],
    ['paso desconocido', { failedStep: 'ship' }],
    ['pasos no lista', { completedSteps: 'validate-customer' }],
    ['saleId no UUID', { saleId: 'abc' }],
  ])('rechaza %s', (_name, overrides) => {
    expect(() => parseSaga(sagaFixture(overrides))).toThrow('Respuesta de saga inválida')
  })
  it('rechaza lo que no es un objeto', () => {
    expect(() => parseSaga(null)).toThrow('Respuesta de saga inválida')
  })
  it('traduce cada paso al español, sin exponer el enum', () => {
    expect(STEP_LABELS).toEqual({
      'validate-customer': 'validación del cliente', 'reserve-stock': 'reserva de stock', 'register-sale': 'registro de la venta',
    })
  })
})

describe('registrationReducer', () => {
  const step = (state: RegistrationState, ...events: Parameters<typeof registrationReducer>[1][]) => events.reduce(registrationReducer, state)

  it('flujo feliz: idle → submitting → running → completed', () => {
    const state = step(initialRegistration, { type: 'submit' }, { type: 'saga', saga: saga() }, { type: 'saga', saga: completed })
    expect(state).toEqual({ phase: 'completed', saga: completed })
  })
  it('un 201 ya COMPLETED salta running', () => {
    expect(step(initialRegistration, { type: 'submit' }, { type: 'saga', saga: completed }).phase).toBe('completed')
  })
  it('COMPENSATED y FAILED son terminales distintos', () => {
    expect(step(initialRegistration, { type: 'submit' }, { type: 'saga', saga: saga({ status: 'COMPENSATED', failedStep: 'reserve-stock' }) }).phase).toBe('compensated')
    expect(step(initialRegistration, { type: 'submit' }, { type: 'saga', saga: saga({ status: 'FAILED', failedStep: 'register-sale' }) }).phase).toBe('failed')
  })
  it('COMPLETED sin saleId nunca se presenta como éxito: queda sin resolver', () => {
    const state = step(initialRegistration, { type: 'submit' }, { type: 'saga', saga: saga({ status: 'COMPLETED' }) })
    expect(state).toMatchObject({ phase: 'unresolved', sagaId: ids.saga, reason: 'invalid-response' })
  })
  it('un estado terminal ignora respuestas tardías de la misma saga', () => {
    const done = step(initialRegistration, { type: 'submit' }, { type: 'saga', saga: completed })
    expect(step(done, { type: 'saga', saga: saga() }, { type: 'saga', saga: saga({ status: 'FAILED' }) }, { type: 'unresolved', sagaId: ids.saga, reason: 'timeout' })).toBe(done)
  })
  it('running ignora respuestas de otra saga', () => {
    const running = step(initialRegistration, { type: 'submit' }, { type: 'saga', saga: saga() })
    const other = saga({ sagaId: ids.sale, status: 'COMPLETED', saleId: ids.sale })
    expect(step(running, { type: 'saga', saga: other })).toBe(running)
  })
  it('el tiempo agotado deja la saga sin resolver, conserva su id y no es terminal', () => {
    const unresolved = step(initialRegistration, { type: 'submit' }, { type: 'saga', saga: saga() }, { type: 'unresolved', sagaId: ids.saga, reason: 'timeout' })
    expect(unresolved).toMatchObject({ phase: 'unresolved', sagaId: ids.saga, reason: 'timeout' })
    expect(isPending(unresolved)).toBe(false)
    expect(step(unresolved, { type: 'resume', sagaId: ids.saga }).phase).toBe('running')
    expect(step(unresolved, { type: 'saga', saga: completed }).phase).toBe('completed')
  })
  it('un error de envío no inventa saga ni resultado', () => {
    const state = step(initialRegistration, { type: 'submit' }, { type: 'submit-error', kind: 'uncertain', traceId: 't' })
    expect(state).toEqual({ phase: 'submit-failed', kind: 'uncertain', traceId: 't' })
    expect(step(state, { type: 'submit' }).phase).toBe('submitting')
  })
  it('submit se ignora mientras hay envío o seguimiento en curso (sin doble envío)', () => {
    const submitting = step(initialRegistration, { type: 'submit' })
    expect(step(submitting, { type: 'submit' })).toBe(submitting)
    const running = step(submitting, { type: 'saga', saga: saga() })
    expect(step(running, { type: 'submit' })).toBe(running)
    expect(isPending(submitting)).toBe(true)
    expect(isPending(running)).toBe(true)
  })
  it('reset vuelve a idle', () => {
    expect(step(step(initialRegistration, { type: 'submit' }, { type: 'saga', saga: completed }), { type: 'reset' })).toBe(initialRegistration)
  })
})
