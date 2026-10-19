/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) => item.isDirectory() ? files(resolve(directory, item.name)) : [resolve(directory, item.name)])
}
const styles = files('src').filter((file) => file.endsWith('.css')).map((file) => readFileSync(file, 'utf8')).join('\n')
it('consume temas del host sin raíces, paletas, fuentes ni tokens locales', () => {
  expect(styles).not.toMatch(/:root|#[\da-f]{3,8}\b|\b(?:rgb|hsl)a?\(|@font-face|@import|--[\w-]+\s*:/i)
  expect(styles).toContain('background: var(--color-bg-card)')
  expect(styles).toContain('box-shadow: var(--shadow-md)')
  expect(styles).toContain('font-family: var(--font-family-heading)')
  expect(styles).toContain('font-weight: var(--font-weight-black)')
  expect(styles).toContain('text-transform: uppercase')
  expect(styles).toContain('text-align: right')
  expect(styles).toContain('font-variant-numeric: tabular-nums')
  expect(styles).toContain('prefers-color-scheme: dark')
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
