import { render, screen, within } from '@testing-library/react'
import { apiClient } from '../../test-doubles/shellApiClient'
import { session } from '../../test-doubles/shellSession'
import { SalesPage } from './SalesPage'

beforeEach(() => {
  apiClient.request.mockReset().mockReturnValue(new Promise(() => {}))
  session.user.mockReset().mockReturnValue({ sub: 'identity', role: 'ADMIN' })
})

it('el historial enlaza con los tres reportes y marca «Historial» como sección actual', () => {
  render(<SalesPage />)
  const nav = screen.getByRole('navigation', { name: 'Secciones de Ventas' })
  expect(within(nav).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
    '/sales', '/sales/reports/daily', '/sales/reports/monthly', '/sales/reports/top-products',
  ])
  expect(within(nav).getByRole('link', { name: 'Historial' })).toHaveAttribute('aria-current', 'page')
  expect(within(nav).getByRole('link', { name: 'Diarios' })).not.toHaveAttribute('aria-current')
})
