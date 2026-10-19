/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) => item.isDirectory() ? files(resolve(directory, item.name)) : [resolve(directory, item.name)])
}
const production = files('src').filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.|test-doubles|test-setup|\.d\.ts$/.test(file))
const source = (pattern: RegExp) => production.filter((file) => pattern.test(readFileSync(file, 'utf8')))

it('el navegador nunca registra una venta directamente en Sales: solo Workflow', () => {
  const offenders = production.filter((file) => /method:\s*'POST'/.test(readFileSync(file, 'utf8')))
  expect(offenders.map((file) => file.replace(/\\/g, '/').split('/src/')[1])).toEqual(['sales/api/workflowApi.ts'])
  expect(readFileSync(resolve('src/sales/api/workflowApi.ts'), 'utf8')).toContain("'/api/v1/sagas/register-sale'")
  expect(source(/['"`]\/api\/v1\/sales['"`][^)]*method:\s*'(POST|PUT|PATCH|DELETE)'/)).toEqual([])
})
it('solo la API de Workflow conoce los campos de la solicitud y ninguno es sensible', () => {
  const adapter = readFileSync(resolve('src/sales/api/workflowApi.ts'), 'utf8')
  expect(adapter).not.toMatch(/createdBy|unitPriceCents|subtotalCents|totalCents|saleId:|SERVICE/)
})
it('las claves de idempotencia salen de crypto.randomUUID y no de Math.random ni de la fecha', () => {
  const hook = readFileSync(resolve('src/sales/pages/useRegisterSale.ts'), 'utf8')
  expect(hook).toContain('crypto.randomUUID()')
  expect(source(/Math\.random|Date\.now\(\)\.toString/)).toEqual([])
})
it('el código de producción no embebe datos de venta, clientes ni productos', () => {
  expect(source(/Ana Pérez|Teclado mecánico|550e8400-e29b-41d4/)).toEqual([])
})
it('solo hay un cliente HTTP y ninguna dependencia nueva de transporte o router', () => {
  const manifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { dependencies: Record<string, string> }
  expect(Object.keys(manifest.dependencies).sort()).toEqual(['react', 'react-dom'])
  expect(source(/react-router|BrowserRouter|XMLHttpRequest|axios/)).toEqual([])
})

it('el aviso de propiedad tiene una sola definición de estilos', () => {
  const css = readFileSync(resolve('src/sales/pages/SalesPage.module.css'), 'utf8')
  expect(css.match(/\.notice\s*\{/g)).toHaveLength(1)
  expect(css.match(/\.noticeText\s*\{/g)).toHaveLength(1)
})
