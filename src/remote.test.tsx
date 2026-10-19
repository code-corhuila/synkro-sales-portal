import { act, render, screen } from '@testing-library/react'
import { navigateTo } from './navigation'
import { federationConfig, createFederationConfig } from './federation.config'
import { apiClient } from 'shell/apiClient'
import { session } from 'shell/session'
import { apiClient as double } from './test-doubles/shellApiClient'
import { session as identity } from './test-doubles/shellSession'
import App from './App'

describe('contrato del remoto', () => {
  it('expone Sales con React compatible y shell', () => {
    expect(federationConfig).toEqual({
      name: 'salesPortal', filename: 'remoteEntry.js', exposes: { './App': './src/App.tsx' },
      remotes: { shell: 'http://localhost:5173/assets/remoteEntry.js' },
      shared: { react: { requiredVersion: '^19.2.8' }, 'react-dom': { requiredVersion: '^19.2.8' } },
    })
    expect(createFederationConfig('https://host.example/assets/remoteEntry.js').remotes.shell).toBe('https://host.example/assets/remoteEntry.js')
    expect(apiClient).toBe(double)
    expect(session).toBe(identity)
  })
  it.each(['/sales', '/sales/'])('monta el historial en %s', (path) => {
    window.history.replaceState({}, '', path)
    double.request.mockReturnValue(new Promise(() => {}))
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Ventas' })).toBeVisible()
  })
  it('no ocupa otra ruta ni crea un router', () => {
    window.history.replaceState({}, '', '/products')
    expect(render(<App />).container).toBeEmptyDOMElement()
  })
})

describe('rutas de Sales', () => {
  const saleId = '550e8400-e29b-41d4-a716-446655440003'
  afterEach(() => window.history.replaceState(null, '', '/'))

  it.each([`/sales/${saleId}`, `/sales/${saleId}/`])('monta el detalle en %s', (path) => {
    window.history.replaceState({}, '', path)
    double.request.mockReturnValue(new Promise(() => {}))
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Detalle de venta' })).toBeVisible()
    expect(double.request).toHaveBeenCalledWith(`/api/v1/sales/${saleId}`, expect.anything())
  })
  it.each(['/sales/a/b', '/sales/%E0%A4%A', '/salesx', '/sales//'])('no ocupa %s', (path) => {
    window.history.replaceState({}, '', path)
    double.request.mockReset()
    expect(render(<App />).container).toBeEmptyDOMElement()
  })
  it('el historial y el detalle se alternan con Atrás/Adelante cuando el host vuelve a renderizar', () => {
    double.request.mockReturnValue(new Promise(() => {}))
    window.history.replaceState({}, '', '/sales')
    const view = render(<App />)
    expect(screen.getByRole('heading', { name: 'Ventas' })).toBeVisible()
    window.history.pushState(null, '', `/sales/${saleId}`)
    view.rerender(<App />)
    expect(screen.getByRole('heading', { name: 'Detalle de venta' })).toBeVisible()
    window.history.back()
    return new Promise<void>((resolve) => window.addEventListener('popstate', () => {
      view.rerender(<App />)
      expect(screen.getByRole('heading', { name: 'Ventas' })).toBeVisible()
      resolve()
    }, { once: true }))
  })
  it('se actualiza por sí solo con popstate: el host no vuelve a renderizar al remoto entre /sales y /sales/{id}', () => {
    double.request.mockReturnValue(new Promise(() => {}))
    window.history.replaceState({}, '', '/sales')
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Ventas' })).toBeVisible()
    act(() => navigateTo(`/sales/${saleId}`))
    expect(screen.getByRole('heading', { name: 'Detalle de venta' })).toBeVisible()
    act(() => { window.history.back() })
  })
  it('un id no UUID muestra «Venta no encontrada» sin consultar Sales', () => {
    window.history.replaceState({}, '', '/sales/reports')
    double.request.mockReset()
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Venta no encontrada' })).toBeVisible()
    expect(double.request).not.toHaveBeenCalled()
  })
})
