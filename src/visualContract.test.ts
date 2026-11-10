/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) => item.isDirectory() ? files(resolve(directory, item.name)) : [resolve(directory, item.name)])
}
const styles = files('src').filter((file) => file.endsWith('.css')).map((file) => readFileSync(file, 'utf8')).join('\n')
it('consume temas del host sin raíces, paletas, fuentes ni tokens locales', () => {
  // Leer el tema del Host (:root[data-theme='dark'] .x) no define nada: se permite solo esa forma,
  // más el fallback transitorio (:root:not([data-theme]) .x) bajo prefers-color-scheme.
  const ownedStyles = styles.replaceAll(":root[data-theme='dark']", '').replaceAll(':root:not([data-theme])', '')
  expect(ownedStyles).not.toMatch(/:root|#[\da-f]{3,8}\b|\b(?:rgb|hsl)a?\(|@font-face|@import|--[\w-]+\s*:/i)
  expect(styles).toContain('background: var(--color-bg-card)')
  expect(styles).toContain('box-shadow: var(--shadow-md)')
  expect(styles).toContain('font-family: var(--font-family-heading)')
  expect(styles).toContain('font-weight: var(--font-weight-black)')
  expect(styles).toContain('text-transform: uppercase')
  expect(styles).toContain('text-align: right')
  expect(styles).toContain('font-variant-numeric: tabular-nums')
  expect(styles).toContain("data-theme='dark'")
  expect(styles).toContain('prefers-reduced-motion: reduce')
  expect(styles).toContain(':focus-visible')
})
it('limita el scroll a la tabla y permite wrap en filtros y paginación', () => {
  expect(styles).toContain('overflow-x: auto')
  expect(styles).toContain('min-width: 0')
  expect(styles).toContain('flex-wrap: wrap')
})
it('el código de producción solo importa capacidades compartidas sin transporte ni credenciales', () => {
  const source = files('src').filter((file) => /\.(ts|tsx)$/.test(file) && !/test|\.d\.ts$/.test(file)).map((file) => readFileSync(file, 'utf8')).join('\n')
  expect(source).toContain("import { apiClient } from 'shell/apiClient'")
  expect(source).toContain("import { session } from 'shell/session'")
  expect(source).not.toMatch(/\bfetch\s*\(|axios|localStorage|Bearer|Authorization|eyJ[\w-]+\.[\w-]+\.[\w-]+|:8000/)
  const storageUsers = files('src').filter((file) => /\.(ts|tsx)$/.test(file) && !/test|\.d\.ts$/.test(file))
    .filter((file) => /sessionStorage/.test(readFileSync(file, 'utf8')))
  expect(storageUsers.map((file) => file.replace(/\\/g, '/').split('/src/')[1])).toEqual(['sales/model/intentJournal.ts'])
})
it('sigue el tema elegido en el Host (data-theme); prefers-color-scheme solo como fallback transitorio', () => {
  expect(styles).toContain(":root[data-theme='dark']")
  // No se permite ninguna otra condición de medio para colores (p. ej. prefers-color-scheme: light).
  const schemes = [...styles.matchAll(/prefers-color-scheme:\s*(\w+)/gi)]
  expect(schemes.every(([, value]) => value === 'dark')).toBe(true)

  const mediaDarkBlocks = [...styles.matchAll(/@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n\}/g)]
  expect(mediaDarkBlocks.length).toBeGreaterThan(0)
  for (const [, body] of mediaDarkBlocks) {
    const selectors = [...body.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(([, selector]) => selector.trim())
    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) {
      // Mientras el Host no envíe data-theme, el fallback puede actuar; en cuanto exista
      // (incluido data-theme='light'), :not([data-theme]) lo desactiva.
      expect(selector.trim()).toMatch(/^:root:not\(\[data-theme\]\)/)
    }
  }

  // Cada regla dentro de un bloque @media debe tener su contraparte explícita en data-theme='dark'.
  const fallbackSelectors = mediaDarkBlocks.flatMap(([, body]) =>
    [...body.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(([, selector]) => selector.trim()))
  for (const selector of fallbackSelectors) {
    const darkSelector = selector.trim().replace(":root:not([data-theme])", ":root[data-theme='dark']")
    expect(styles).toContain(darkSelector)
  }
})

// jsdom does not apply CSS, so the unit tests cannot see that `display: flex` on a class overrides the
// `hidden` attribute (found in a real browser: the closed suggestion list stayed on screen after Escape).
it('una lista con atributo hidden no queda visible por el display de su clase', () => {
  const form = readFileSync(resolve('src/sales/components/SaleForm.module.css'), 'utf8')
  expect(form).toMatch(/\.lines\[hidden\]\s*\{[^}]*display:\s*none/)
})
