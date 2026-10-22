import { formatCents, formatDate } from './formatting'

it('muestra COP con dos decimales, sin recalcular ni multiplicar floats', () => {
  expect(formatCents(7)).toMatch(/0,07/)
  expect(formatCents(123456789)).toMatch(/1\.234\.567,89/)
  expect(formatCents(0)).toMatch(/0,00/)
  expect(formatCents(Number.MAX_SAFE_INTEGER)).toMatch(/90\.071\.992\.547\.409,91/)
})
it.each([Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, 0.7, -1])('nunca muestra un importe inseguro %s', (amount) => {
  expect(formatCents(amount)).toBe('Importe fuera del rango seguro')
})
it('fecha colombiana en Bogotá y fecha inválida explícita', () => {
  expect(formatDate('2026-10-12T01:00:00Z')).toContain('11')
  expect(formatDate('2026-10-12T01:00:00Z')).toContain('2026')
  expect(formatDate('invalid')).toBe('Fecha no disponible')
})
