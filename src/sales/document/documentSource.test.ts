/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) => item.isDirectory() ? files(resolve(directory, item.name)) : [resolve(directory, item.name)])
}
const production = files('src/sales/document').filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\./.test(file))
const source = production.map((file) => readFileSync(file, 'utf8')).join('\n')

it('la generación no depende de recursos remotos, de la impresión del navegador ni de capturas raster', () => {
  expect(production.length).toBeGreaterThan(5)
  expect(source).not.toMatch(/https?:\/\/(?!www\.w3\.org)/)
  expect(source).not.toMatch(/googleapis|gstatic|window\.print|\.print\(\)|html2canvas|jspdf|iframe|document\.write/i)
  expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/)
})

it('el XML se escapa con una función propia y no con concatenación de texto sin escape', () => {
  const xml = readFileSync(resolve('src/sales/document/saleDocumentXml.ts'), 'utf8')
  expect(xml).toMatch(/&amp;/)
  expect(xml).not.toMatch(/innerHTML|dangerouslySetInnerHTML/)
})

it('el emisor no tiene valores de ejemplo en el código de producción', () => {
  expect(source).not.toMatch(/900\.XXX|ventas@synkrotech|Calle 00|\bFV-\d/)
})

it('el esquema publicado coincide con la versión que el código declara', () => {
  const xsd = readFileSync(resolve('docs/schemas/sale-document-1.0.xsd'), 'utf8')
  expect(xsd).toContain('urn:synkro:sales:sale-document:1.0')
  expect(source).toContain('urn:synkro:sales:sale-document:1.0')
})
