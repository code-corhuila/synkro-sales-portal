import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { navigateTo, redirectToSales, saleDetailPath, takeSalesNotice } from './navigation'
import { saleDetailPath as routedPath } from './routes'
import { PortalLink } from './sales/components/PortalLink'

afterEach(() => window.history.replaceState(null, '', '/'))

describe('saleDetailPath', () => {
  it('es el mismo helper que expone routes y codifica el identificador', () => {
    expect(routedPath).toBe(saleDetailPath)
    expect(saleDetailPath('abc')).toBe('/sales/abc')
    expect(saleDetailPath('a/b c')).toBe('/sales/a%2Fb%20c')
  })
})

describe('navigateTo', () => {
  it('empuja la URL y avisa con popstate al router del host', () => {
    const listener = vi.fn()
    window.addEventListener('popstate', listener)
    const before = window.history.length
    navigateTo('/sales/1')
    window.removeEventListener('popstate', listener)
    expect(window.location.pathname).toBe('/sales/1')
    expect(window.history.length).toBe(before + 1)
    expect(listener).toHaveBeenCalledTimes(1)
  })
  it('no duplica la entrada del historial si ya está en esa ruta', () => {
    window.history.replaceState(null, '', '/sales')
    const listener = vi.fn()
    window.addEventListener('popstate', listener)
    navigateTo('/sales')
    window.removeEventListener('popstate', listener)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('redirectToSales', () => {
  it('reemplaza la entrada actual (Atrás no vuelve a la venta prohibida) y deja un aviso de un solo uso', () => {
    window.history.replaceState(null, '', '/sales/forbidden')
    const before = window.history.length
    const listener = vi.fn()
    window.addEventListener('popstate', listener)
    redirectToSales('forbidden')
    window.removeEventListener('popstate', listener)
    expect(window.location.pathname).toBe('/sales')
    expect(window.history.length).toBe(before)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(takeSalesNotice()).toBe('forbidden')
    expect(takeSalesNotice()).toBeNull()
  })
  it('ignora estados de historial ajenos', () => {
    window.history.replaceState({ usr: 'x' }, '', '/sales')
    expect(takeSalesNotice()).toBeNull()
    expect(window.history.state).toEqual({ usr: 'x' })
  })
})

describe('PortalLink', () => {
  it('un clic simple navega sin recargar el documento', async () => {
    render(<PortalLink href="/sales/9">Ver</PortalLink>)
    await userEvent.setup().click(screen.getByRole('link', { name: 'Ver' }))
    expect(window.location.pathname).toBe('/sales/9')
  })
  it('un clic con modificador conserva el comportamiento del navegador (href real)', async () => {
    window.history.replaceState(null, '', '/sales')
    render(<PortalLink href="/sales/9">Ver</PortalLink>)
    const user = userEvent.setup()
    await user.keyboard('{Control>}')
    await user.click(screen.getByRole('link', { name: 'Ver' }))
    expect(window.location.pathname).toBe('/sales')
    expect(screen.getByRole('link', { name: 'Ver' })).toHaveAttribute('href', '/sales/9')
  })
})
