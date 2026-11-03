import { formatUtcDay, formatUtcMonth } from './reportFormatting'
import { formatCents } from './formatting'

describe('fechas de reportes (día UTC del contrato)', () => {
  it('muestra el día UTC sin desplazarlo a la zona horaria del visitante', () => {
    // 2026-10-12 es un día UTC: en Bogotá (UTC-5) un Date local lo mostraría como el 11.
    expect(formatUtcDay('2026-10-12')).toMatch(/12.*oct.*2026/i)
    expect(formatUtcDay('2026-01-01')).toMatch(/1.*ene.*2026/i)
  })
  it('muestra el mes con el primer día del mes del contrato', () => {
    expect(formatUtcMonth('2026-09-01')).toMatch(/septiembre.*2026/i)
    expect(formatUtcMonth('2026-01-01')).toMatch(/enero.*2026/i)
  })
  it.each(['', 'ayer', '2026-13-40', '2026-02-30', '2026-10-12T00:00:00Z'])('no inventa una fecha para %j', (value) => {
    expect(formatUtcDay(value)).toBe('Fecha no disponible')
    expect(formatUtcMonth(value)).toBe('Fecha no disponible')
  })
})

describe('importes de reportes', () => {
  it('conserva centavos enteros sin redondear', () => {
    expect(formatCents(123456789)).toMatch(/1\.234\.567,89/)
    expect(formatCents(5)).toMatch(/0,05/)
  })
  it('rechaza importes int64 que JavaScript no representa con exactitud', () => {
    expect(formatCents(Number.MAX_SAFE_INTEGER + 2)).toBe('Importe fuera del rango seguro')
  })
})
