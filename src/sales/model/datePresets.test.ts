import { datePresetRange } from './datePresets'

const now = new Date('2026-10-12T23:40:00Z')

describe('rangos UTC inclusivos de los filtros rápidos', () => {
  it('Hoy es un solo día UTC, igual como desde y como hasta', () => {
    expect(datePresetRange('today', now)).toEqual({ from: '2026-10-12', to: '2026-10-12' })
  })
  it('7 días incluye hoy más los 6 anteriores (7 días en total, ambos extremos inclusive)', () => {
    expect(datePresetRange('7d', now)).toEqual({ from: '2026-10-06', to: '2026-10-12' })
  })
  it('30 días incluye hoy más los 29 anteriores', () => {
    expect(datePresetRange('30d', now)).toEqual({ from: '2026-09-13', to: '2026-10-12' })
  })
  it('Este mes empieza el día 1 UTC del mes vigente y llega hasta hoy', () => {
    expect(datePresetRange('month', now)).toEqual({ from: '2026-10-01', to: '2026-10-12' })
  })
  it('un instante cercano a medianoche UTC no corre el día al vecino', () => {
    expect(datePresetRange('today', new Date('2026-10-12T23:59:59Z'))).toEqual({ from: '2026-10-12', to: '2026-10-12' })
    expect(datePresetRange('today', new Date('2026-10-12T00:00:00Z'))).toEqual({ from: '2026-10-12', to: '2026-10-12' })
  })
  it('Este mes en el primer día del mes es un solo día', () => {
    expect(datePresetRange('month', new Date('2026-11-01T05:00:00Z'))).toEqual({ from: '2026-11-01', to: '2026-11-01' })
  })
})
