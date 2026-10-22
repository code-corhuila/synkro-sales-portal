import { render, screen } from '@testing-library/react'
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
