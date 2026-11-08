/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateXML } from 'xmllint-wasm'
import { documentFixture, productIdOf } from '../../test-doubles/saleDocument'
import { buildSaleDocumentXml, SALE_DOCUMENT_NAMESPACE } from './saleDocumentXml'
import type { SaleDocument } from './types'

const schema = readFileSync(resolve('docs/schemas/sale-document-1.1.xsd'), 'utf8')
const validate = (xml: string) => validateXML({ xml: [{ fileName: 'document.xml', contents: xml }], schema: [{ fileName: 'sale-document-1.1.xsd', contents: schema }] })
const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml')
const text = (root: ParentNode, selector: string) => root.querySelector(selector)?.textContent ?? null

it('produce XML 1.0 UTF-8 que valida contra el esquema comercial versionado', async () => {
  const xml = buildSaleDocumentXml(documentFixture())
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
  const result = await validate(xml)
  expect(result.errors).toEqual([])
  expect(result.valid).toBe(true)
})

it('el validador realmente rechaza un documento que no respeta el esquema', async () => {
  const xml = buildSaleDocumentXml(documentFixture())
  for (const broken of [
    xml.replace('<status>ACTIVE</status>', '<status>PAGADA</status>'),
    xml.replace(/<totalCents>\d+<\/totalCents>/, '<totalCents>12.5</totalCents>'),
    xml.replace('<fiscalValidity>NONE</fiscalValidity>', '<fiscalValidity>DIAN</fiscalValidity>'),
    xml.replace(/<quantity>\d+<\/quantity>/, '<quantity>0</quantity>'),
    xml.replace('<saleDocument', '<saleDocument extra="1"'),
  ]) {
    expect(broken).not.toBe(xml)
    expect((await validate(broken)).valid).toBe(false)
  }
})

it('declara el espacio de nombres y la versión del esquema', () => {
  const root = parse(buildSaleDocumentXml(documentFixture())).documentElement
  expect(root.localName).toBe('saleDocument')
  expect(root.namespaceURI).toBe(SALE_DOCUMENT_NAMESPACE)
  expect(root.getAttribute('schemaVersion')).toBe('1.1')
})

it('aclara en el propio archivo que es un comprobante comercial sin validez fiscal', () => {
  const xml = parse(buildSaleDocumentXml(documentFixture()))
  expect(text(xml, 'documentType')).toBe('COMMERCIAL_RECEIPT')
  expect(text(xml, 'fiscalValidity')).toBe('NONE')
})

it('refleja exactamente el modelo: identificador completo, estado, fechas distintas, cantidades e importes', () => {
  const model = documentFixture()
  const xml = parse(buildSaleDocumentXml(model))
  expect(text(xml, 'saleId')).toBe(model.saleId)
  expect(text(xml, 'status')).toBe('ACTIVE')
  expect(text(xml, 'saleDate')).toBe(model.saleDate)
  expect(text(xml, 'generatedAt')).toBe(model.generatedAt)
  expect(text(xml, 'saleDate')).not.toBe(text(xml, 'generatedAt'))
  expect(text(xml, 'currency')).toBe('COP')
  expect(xml.querySelector('currency')?.getAttribute('minorUnitDigits')).toBe('2')
  const line = xml.querySelector('line')!
  expect(line.getAttribute('position')).toBe('1')
  expect(text(line, 'productId')).toBe(model.lines[0].productId)
  expect(text(line, 'quantity')).toBe(String(model.lines[0].quantity))
  expect(text(line, 'unitPriceCents')).toBe(String(model.lines[0].unitPriceCents))
  expect(text(line, 'subtotalCents')).toBe(String(model.lines[0].subtotalCents))
  expect(text(xml, 'saleDocument > totalCents')).toBe(String(model.totalCents))
  expect(xml.querySelector('lines')?.getAttribute('count')).toBe('1')
  expect(xml.querySelector('lines')?.getAttribute('unitCount')).toBe(String(model.unitCount))
})

it('distingue en el archivo qué datos son vigentes y cuáles configuración', () => {
  const xml = parse(buildSaleDocumentXml(documentFixture()))
  expect(xml.querySelector('issuer')?.getAttribute('origin')).toBe('CONFIGURATION')
  expect(xml.querySelector('customer')?.getAttribute('origin')).toBe('CURRENT_RECORD')
  expect(xml.querySelector('line > product')?.getAttribute('origin')).toBe('CURRENT_RECORD')
})

it('conserva los centavos enteros sin notación científica ni decimales', () => {
  const xml = buildSaleDocumentXml(documentFixture({
    totalCents: 9_007_199_254_740_991,
    lines: [{ position: 1, productId: productIdOf(1), productName: 'Equipo', quantity: 1, unitPriceCents: 9_007_199_254_740_991, subtotalCents: 9_007_199_254_740_991 }],
    unitCount: 1,
  }))
  expect(xml).toContain('<totalCents>9007199254740991</totalCents>')
  expect(xml).not.toMatch(/e\+|\d\.\d{1,2}<\/(?:unitPrice|subtotal|total)Cents/)
})

it('escapa & < > comillas y apóstrofos tanto en texto como en atributos, y conserva acentos y ñ', async () => {
  const name = `Niño Ñandú & Hijos <"Café"> 'x' ¿Qué? €`
  const model = documentFixture({
    customer: { ...documentFixture().customer, name: `Pérez & "Hnos" <S.A.S.>` },
    lines: [{ ...documentFixture().lines[0], productName: name, categoryName: `Cat & <egoría>` }],
  })
  const xml = buildSaleDocumentXml(model)
  expect(xml).toContain('Niño Ñandú &amp; Hijos &lt;&quot;Café&quot;&gt; &apos;x&apos; ¿Qué? €')
  expect(xml).not.toMatch(/<name>[^<]*[&](?!amp;|lt;|gt;|quot;|apos;)/)
  const parsed = parse(xml)
  expect(parsed.querySelector('parsererror')).toBeNull()
  expect(text(parsed, 'line > product > name')).toBe(name)
  expect(text(parsed, 'line > product > category')).toBe('Cat & <egoría>')
  expect(text(parsed, 'customer > name')).toBe('Pérez & "Hnos" <S.A.S.>')
  expect((await validate(xml)).valid).toBe(true)
})

it('un texto que parece marcado XML no puede inyectar elementos', () => {
  const evil = '</name><totalCents>1</totalCents><name>'
  const xml = buildSaleDocumentXml(documentFixture({ lines: [{ ...documentFixture().lines[0], productName: evil }] }))
  const parsed = parse(xml)
  expect(parsed.querySelectorAll('totalCents')).toHaveLength(1) // only the real one
  expect(text(parsed, 'line > product > name')).toBe(evil)
})

it('los caracteres no válidos en XML 1.0 no llegan al archivo: el documento sigue siendo XML bien formado', async () => {
  const dirty = 'A\u0000B\u0008C\u000BD\u000CE\u001FF￾G￿H\uD800I'
  const model = documentFixture({ lines: [{ ...documentFixture().lines[0], productName: dirty }] })
  const xml = buildSaleDocumentXml(model)
  // eslint-disable-next-line no-control-regex
  expect(xml).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/)
  expect(parse(xml).querySelector('parsererror')).toBeNull()
  expect((await validate(xml)).valid).toBe(true)
})

it('un documento anulado se exporta como VOIDED, nunca como activo', async () => {
  const xml = buildSaleDocumentXml(documentFixture({ status: 'VOIDED' }))
  expect(text(parse(xml), 'status')).toBe('VOIDED')
  expect(xml).not.toContain('<status>ACTIVE</status>')
  expect((await validate(xml)).valid).toBe(true)
})

it('omite los contactos opcionales ausentes sin elementos vacíos ni la palabra undefined/null', async () => {
  const bare = documentFixture({
    issuer: { legalName: 'Empresa S.A.S.', taxId: '800123456-7' },
    customer: { customerId: documentFixture().customer.customerId, name: 'Ana', identityDocument: '1' },
    lines: [{ ...documentFixture().lines[0], categoryName: undefined }],
  })
  const xml = buildSaleDocumentXml(bare)
  expect(xml).not.toMatch(/undefined|null|<(?:address|phone|email|category)\/>|<(address|phone|email|category)><\/\1>/)
  const parsed = parse(xml)
  for (const selector of ['issuer > address', 'issuer > phone', 'issuer > email', 'customer > address', 'customer > phone', 'customer > email', 'product > category']) {
    expect(parsed.querySelector(selector)).toBeNull()
  }
  expect((await validate(xml)).valid).toBe(true)
})

it('no contiene impuestos, CUFE, QR, consecutivos, firma ni datos internos', () => {
  const xml = buildSaleDocumentXml(documentFixture()).toLowerCase()
  expect(xml).not.toMatch(/\b(?:iva|cufe|qr|signature|consecutiv\w*|resolution|createdby|detailid|password|token|secret)\b/)
})

it('es determinista: el mismo modelo produce los mismos bytes', () => {
  const model: SaleDocument = documentFixture()
  expect(buildSaleDocumentXml(model)).toBe(buildSaleDocumentXml(structuredClone(model)))
})

it('un documento de muchas líneas valida contra el esquema', async () => {
  const lines = Array.from({ length: 150 }, (_, index) => ({ position: index + 1, productId: productIdOf(index), productName: `Producto ${index + 1}`, quantity: 2, unitPriceCents: 1_999, subtotalCents: 3_998 }))
  const xml = buildSaleDocumentXml(documentFixture({ lines, unitCount: 300, totalCents: 3_998 * 150 }))
  expect((await validate(xml)).valid).toBe(true)
  expect(parse(xml).querySelectorAll('line')).toHaveLength(150)
})
