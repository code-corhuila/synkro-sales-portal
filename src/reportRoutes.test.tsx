import { render, screen } from '@testing-library/react'
import { parseRoute } from './routes'
import { reportPath } from './navigation'
import { apiClient } from './test-doubles/shellApiClient'
import { session } from './test-doubles/shellSession'
import App from './App'

afterEach(() => window.history.replaceState(null, '', '/'))

describe('rutas de reportes', () => {
  it.each([
    ['/sales/reports', 'daily'], ['/sales/reports/', 'daily'], ['/sales/reports/daily', 'daily'],
    ['/sales/reports/monthly/', 'monthly'], ['/sales/reports/top-products', 'top-products'],
  ])('%s es el reporte %s y no el detalle de una venta llamada "reports"', (path, kind) => {
    expect(parseRoute(path)).toEqual({ screen: 'report', kind })
  })
  it.each(['/sales/reports/weekly', '/sales/reports/daily/extra', '/sales/reports/%E0%A4%A'])('%s no es una pantalla de Sales', (path) => {
    expect(parseRoute(path)).toBeNull()
  })
  it('la historia y el detalle siguen igual', () => {
    expect(parseRoute('/sales')).toEqual({ screen: 'history' })
    expect(parseRoute('/sales/abc')).toEqual({ screen: 'detail', saleId: 'abc' })
  })
  it('reportPath construye rutas canónicas', () => {
    expect(reportPath('daily')).toBe('/sales/reports/daily')
    expect(reportPath('monthly')).toBe('/sales/reports/monthly')
    expect(reportPath('top-products')).toBe('/sales/reports/top-products')
  })
})

describe('App monta los reportes', () => {
  beforeEach(() => {
    session.user.mockReset().mockReturnValue({ sub: 'identity', role: 'ADMIN' })
    apiClient.request.mockReset().mockReturnValue(new Promise(() => {}))
  })
  it.each([['/sales/reports/daily', 'Reporte diario'], ['/sales/reports/monthly', 'Reporte mensual'], ['/sales/reports/top-products', 'Productos más vendidos']])('%s muestra «%s»', (path, title) => {
    window.history.replaceState({}, '', path)
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeVisible()
    expect(apiClient.request.mock.calls.every(([url]) => String(url).includes('/reports/'))).toBe(true)
    expect(apiClient.request.mock.calls.some(([url]) => String(url).startsWith('/api/v1/sales/reports/'))).toBe(true)
  })
  it('no pide el historial ni un detalle al entrar a un reporte', () => {
    window.history.replaceState({}, '', '/sales/reports/daily')
    render(<App />)
    expect(apiClient.request.mock.calls.map(([url]) => url)).not.toContain('/api/v1/sales')
    expect(apiClient.request.mock.calls.map(([url]) => String(url))).not.toContain('/api/v1/sales/reports')
  })
})
