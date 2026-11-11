import { formatUtcDay, formatUtcMonth, visibleScopeLabel } from './reportFormatting'
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

describe('alcance visible de un rango (una página nunca pasa por el rango completo)', () => {
  it('una sola página dice el total exacto, en singular cuando aplica', () => {
    expect(visibleScopeLabel(1, { total: 1, totalPages: 1 }, 'día', 'días')).toBe('Mostrando 1 día del rango seleccionado.')
    expect(visibleScopeLabel(3, { total: 3, totalPages: 1 }, 'día', 'días')).toBe('Mostrando 3 días del rango seleccionado.')
  })
  it('varias páginas dicen "N de M" sin asumir que la página visible es la primera', () => {
    expect(visibleScopeLabel(20, { total: 45, totalPages: 3 }, 'día', 'días')).toBe('Mostrando 20 de 45 días del rango seleccionado.')
  })
  it('un rango sin resultados no reclama alcance alguno', () => {
    expect(visibleScopeLabel(0, { total: 0, totalPages: 0 }, 'día', 'días')).toBe('')
  })
})
