// @vitest-environment node

// Generating a PDF embeds fonts and lays out text: under coverage and a busy CI runner it needs more than 5 s.
vi.setConfig({ testTimeout: 60_000 })
import { documentFixture, productIdOf, readPdf, type PdfPageText } from '../../../test-doubles/saleDocument'
import { formatCents } from '../../model/formatting'
import { buildSaleDocumentPdf, fitInside, PDF_PAGE } from './buildSaleDocumentPdf'
import type { SaleDocument, SaleDocumentLine } from '../types'

const squash = (value: string) => value.replace(/\s+/g, ' ').trim()
const money = (cents: number) => squash(formatCents(cents))
// Building a PDF is the expensive part (six fonts are parsed and subset); under coverage it is ~10x slower. Tests that
// ask for the same document share one generation. readPdf gets a copy because pdf.js may detach the buffer it reads.
const generated = new Map<string, Promise<{ bytes: Uint8Array; read: Awaited<ReturnType<typeof readPdf>> }>>()
function generate(document: SaleDocument) {
  const key = JSON.stringify(document)
  let hit = generated.get(key)
  if (!hit) {
    hit = buildSaleDocumentPdf(document).then(async (bytes) => ({ bytes, read: await readPdf(bytes.slice()) }))
    generated.set(key, hit)
  }
  return hit
}
const render = async (document: SaleDocument) => (await generate(document)).read

it('marca los datos actuales no disponibles y conserva referencias e importes históricos', async () => {
  const model = documentFixture()
  model.customer = { ...model.customer, currentRecordAvailable: false }
  model.lines = model.lines.map(line => ({ ...line, currentRecordAvailable: false,
    productName: `Referencia ${line.productId}`, categoryName: 'Datos actuales no disponibles' }))
  const { pages } = await render(model)
  const text = squash(pages.map(page => page.text).join(' '))
  expect(text).toContain('Datos actuales no disponibles')
  expect(text).toContain(model.customer.customerId)
  expect(text).toContain(model.lines[0].productId)
  expect(text).toContain(money(model.totalCents))
  expect(text).not.toContain('Ana Pérez')
  expect(text).not.toContain(model.customer.identityDocument)
})

function lines(count: number, name = (index: number) => `Producto de catálogo número ${index + 1} con una descripción larga para que ocupe más de una línea en la tabla`): { lines: SaleDocumentLine[]; totalCents: number; unitCount: number } {
  const built = Array.from({ length: count }, (_, index) => {
    const quantity = (index % 5) + 1
    const unitPriceCents = 100_007 + index * 12_345
    return { position: index + 1, productId: productIdOf(index), productName: name(index), categoryName: 'Categoría ' + (index % 3), quantity, unitPriceCents, subtotalCents: quantity * unitPriceCents }
  })
  return { lines: built, totalCents: built.reduce((sum, line) => sum + line.subtotalCents, 0), unitCount: built.reduce((sum, line) => sum + line.quantity, 0) }
}
const overlaps = (page: PdfPageText) => {
  const boxes = page.items.filter((item) => !item.rotated)
  const found: string[] = []
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]
      const b = boxes[j]
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      const overlapY = Math.min(a.y + a.height * 0.8, b.y + b.height * 0.8) - Math.max(a.y, b.y)
      if (overlapX > 0.5 && overlapY > 0.5) found.push(`${a.text} | ${b.text}`)
    }
  }
  return found
}

describe('un documento de una página', () => {
  it('es un PDF real, tamaño carta, con texto seleccionable y metadatos', async () => {
    const { bytes, read: { pages, info } } = await generate(documentFixture())
    expect(new TextDecoder('latin1').decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(new TextDecoder('latin1').decode(bytes.slice(-8))).toContain('%%EOF')
    expect(pages).toHaveLength(1)
    expect([pages[0].width, pages[0].height]).toEqual([PDF_PAGE.width, PDF_PAGE.height])
    expect(pages[0].items.length).toBeGreaterThan(20)
    expect(String(info.Title)).toContain(documentFixture().saleId)
    expect(String(info.Creator)).toContain('Synkro')
  })

  it('titula el documento «Comprobante de venta» y aclara su alcance comercial, sin presentarlo como factura', async () => {
    const [page] = (await render(documentFixture())).pages
    expect(page.text).toMatch(/comprobante de venta/i)
    expect(page.text).toMatch(/alcance comercial/i)
    expect(page.text).toMatch(/no es una factura electr[oó]nica/i)
    expect(page.text).not.toMatch(/factura de venta/i)
  })

  it('muestra el saleId completo, el emisor configurado, el cliente y la línea con importes persistidos', async () => {
    const model = documentFixture()
    const [page] = (await render(model)).pages
    const text = squash(page.text)
    expect(text).toContain(model.saleId)
    expect(text).toContain(model.issuer.legalName)
    expect(text).toContain(model.issuer.taxId)
    expect(text).toContain(model.issuer.address)
    expect(text).toContain(model.customer.name)
    expect(text).toContain(model.customer.identityDocument)
    expect(text).toContain(model.lines[0].productName)
    expect(text).toContain(model.lines[0].categoryName)
    expect(text).toContain(money(model.lines[0].unitPriceCents))
    expect(text).toContain(money(model.lines[0].subtotalCents))
    expect(text).toContain(money(model.totalCents))
  })

  it('conserva los centavos: 0,07 y 125,50 no se redondean ni se truncan', async () => {
    const model = documentFixture({
      lines: [
        { ...documentFixture().lines[0], quantity: 3, unitPriceCents: 12_550, subtotalCents: 37_650 },
        { ...documentFixture().lines[0], position: 2, productId: productIdOf(2), quantity: 1, unitPriceCents: 7, subtotalCents: 7 },
      ],
      unitCount: 4, totalCents: 37_657,
    })
    const text = squash((await render(model)).pages[0].text)
    expect(text).toContain('$ 125,50')
    expect(text).toContain('$ 0,07')
    expect(text).toContain('$ 376,50')
    expect(text).toContain('$ 376,57')
  })

  it('muestra la fecha de venta en America/Bogota y distingue la fecha de generación', async () => {
    const text = squash((await render(documentFixture({ saleDate: '2026-11-07T01:30:00Z', generatedAt: '2026-11-08T14:05:00Z' }))).pages[0].text)
    expect(text).toContain('06/11/2026 · 20:30')
    expect(text).toContain('08/11/2026 · 09:05')
    expect(text).toMatch(/fecha de venta/i)
    expect(text).toMatch(/generado el/i)
  })

  it('no inventa impuestos, base, consecutivo, forma de pago, vendedor, SKU ni valores ficticios', async () => {
    const text = (await render(documentFixture())).pages[0].text
    expect(text).not.toMatch(/\bIVA\b|19 ?%|subtotal \(base\)|base gravable|FV-\d|forma de pago|atendido por|\bSKU\b|900\.XXX|undefined|null|NaN/i)
  })

  it('omite emisor y cliente opcionales ausentes sin etiquetas vacías', async () => {
    const bare = documentFixture({
      issuer: { legalName: 'Empresa S.A.S.', taxId: '800123456-7' },
      customer: { customerId: documentFixture().customer.customerId, name: 'Ana', identityDocument: '1075123456' },
      lines: [{ ...documentFixture().lines[0], categoryName: undefined }],
    })
    const text = squash((await render(bare)).pages[0].text)
    expect(text).toContain('Empresa S.A.S.')
    expect(text).not.toMatch(/undefined|null|·\s*·|Carrera|ana@|3100000000/)
  })

  it('una venta activa no lleva sello ANULADA; una anulada lo lleva y lo declara', async () => {
    expect((await render(documentFixture())).pages[0].text).not.toMatch(/anulada/i)
    const voided = (await render(documentFixture({ status: 'VOIDED' }))).pages[0]
    expect(voided.text).toMatch(/ANULADA/)
    expect(voided.items.some((item) => item.rotated && /ANULADA/.test(item.text))).toBe(true)
  })

  it('numera la única página como «Página 1 de 1» y repite el saleId en el pie', async () => {
    const [page] = (await render(documentFixture())).pages
    expect(squash(page.text)).toContain('Página 1 de 1')
    expect(page.text.split(documentFixture().saleId).length - 1).toBeGreaterThanOrEqual(2)
  })

  it('no superpone ningún texto', async () => {
    expect(overlaps((await render(documentFixture())).pages[0])).toEqual([])
  })
})

describe('documentos largos', () => {
  it('reparte 70 líneas con nombres largos en varias páginas sin perder ninguna', async () => {
    const data = lines(70)
    const { pages } = await render(documentFixture({ ...data }))
    expect(pages.length).toBeGreaterThan(1)
    const text = squash(pages.map((page) => page.text).join(' '))
    for (const line of data.lines) {
      expect(text).toContain(`Producto de catálogo número ${line.position} `)
      expect(text).toContain(money(line.unitPriceCents))
      expect(text).toContain(money(line.subtotalCents))
    }
  })

  it('repite el encabezado de la tabla en cada página y numera «Página i de N»', async () => {
    const { pages } = await render(documentFixture({ ...lines(70) }))
    pages.forEach((page, index) => {
      expect(page.text).toMatch(/descripción/i)
      expect(page.text).toMatch(/valor unitario/i)
      expect(squash(page.text)).toContain(`Página ${index + 1} de ${pages.length}`)
      expect(page.text).toContain(documentFixture().saleId)
    })
  })

  it('muestra el total una sola vez, al final, debajo de todas las líneas y sin superponerse', async () => {
    const data = lines(70)
    const { pages } = await render(documentFixture({ ...data }))
    const labels = pages.flatMap((page) => page.items.filter((item) => /^TOTAL$/i.test(item.text)).map((item) => ({ page: page.number, y: item.y })))
    expect(labels).toHaveLength(1)
    expect(labels[0].page).toBe(pages.length)
    const last = pages[pages.length - 1]
    const lastRowY = Math.min(...last.items.filter((item) => /Producto de catálogo número|Categoría/.test(item.text)).map((item) => item.y))
    expect(labels[0].y).toBeLessThan(lastRowY)
    for (const page of pages) expect(overlaps(page)).toEqual([])
    expect(squash(last.text)).toContain(money(data.totalCents))
  })

  it('el cuerpo nunca invade el pie ni se sale de los márgenes de la página', async () => {
    const { pages } = await render(documentFixture({ ...lines(70) }))
    for (const page of pages) {
      for (const item of page.items.filter((entry) => !entry.rotated)) {
        expect(item.x).toBeGreaterThanOrEqual(PDF_PAGE.margin - 1)
        expect(item.x + item.width).toBeLessThanOrEqual(PDF_PAGE.width - PDF_PAGE.margin + 1)
        expect(item.y).toBeGreaterThanOrEqual(10)
      }
    }
  })

  it('conserva un nombre largo sin espacios dividiéndolo en la columna, sin recortarlo ni desbordarlo', async () => {
    const long = 'Abcdefghij'.repeat(30)
    const model = documentFixture({ lines: [{ ...documentFixture().lines[0], productName: long }] })
    const { pages } = await render(model)
    // Only the description column: numbers drawn between its lines are other cells, not part of the name.
    const flat = pages.flatMap((page) => page.items.filter((item) => /^[Abcdefghij]+$/.test(item.text)).map((item) => item.text)).join('')
    expect(flat).toContain(long)
    for (const page of pages) for (const item of page.items) expect(item.x + item.width).toBeLessThanOrEqual(PDF_PAGE.width - PDF_PAGE.margin + 1)
  })

  it('divide por líneas una descripción que por sí sola excede una página, sin perder texto', async () => {
    const words = Array.from({ length: 1_500 }, (_, index) => `palabra${index}`)
    const model = documentFixture({ lines: [{ ...documentFixture().lines[0], productName: words.join(' ') }] })
    const { pages } = await render(model)
    expect(pages.length).toBeGreaterThan(1)
    const text = squash(pages.map((page) => page.text).join(' '))
    expect(text).toContain('palabra0 ')
    expect(text).toContain('palabra1499')
    expect(text.match(/palabra\d+/g)).toHaveLength(1_500)
  })

  it('una venta con las 100 líneas máximas del contrato conserva todo su texto y se pagina', async () => {
    const data = lines(100)
    const { pages } = await render(documentFixture({ ...data }))
    expect(pages.length).toBeGreaterThan(5)
    const text = squash(pages.map((page) => page.text).join(' '))
    expect(text).toContain('número 100 ')
    expect(text.match(/Producto de catálogo número \d+ /g)).toHaveLength(100)
  })

  it('un sello ANULADA aparece en todas las páginas de una venta anulada', async () => {
    const { pages } = await render(documentFixture({ ...lines(40), status: 'VOIDED' }))
    expect(pages.length).toBeGreaterThan(1)
    for (const page of pages) expect(page.items.some((item) => item.rotated && /ANULADA/.test(item.text))).toBe(true)
  })
})

describe('caracteres especiales', () => {
  it('conserva acentos, ñ, diéresis, signos de apertura, comillas, guiones largos y €', async () => {
    const name = 'Niño Ñandú Güira – “Café” ¿Qué? ¡Sí! € Pérez & Hijos'
    const model = documentFixture({
      customer: { ...documentFixture().customer, name: 'María Ñáñez Güell' },
      lines: [{ ...documentFixture().lines[0], productName: name, categoryName: 'Cámaras y vídeo' }],
    })
    const text = squash((await render(model)).pages[0].text)
    expect(text).toContain(name)
    expect(text).toContain('María Ñáñez Güell')
    expect(text).toContain('Cámaras y vídeo')
  })

  it('sustituye por «?» un carácter que la fuente incluida no tiene, sin fallar ni dejar un hueco', async () => {
    const model = documentFixture({ lines: [{ ...documentFixture().lines[0], productName: 'Teclado 日本 Pro' }] })
    expect(squash((await render(model)).pages[0].text)).toContain('Teclado ?? Pro')
  })

  it('texto con marcas parecidas a markup se imprime literal', async () => {
    const name = '<b>Oferta</b> &amp; "x"'
    const model = documentFixture({ lines: [{ ...documentFixture().lines[0], productName: name }] })
    expect(squash((await render(model)).pages[0].text)).toContain(name)
  })
})

describe('el logo', () => {
  it('se ajusta a su caja conservando la proporción, sin deformarse ni ampliarse', () => {
    expect(fitInside(420, 262, 148, 92)).toEqual({ width: expect.closeTo(147.5, 0), height: 92 })
    const fit = fitInside(420, 262, 148, 92)
    expect(fit.width / fit.height).toBeCloseTo(420 / 262, 5)
    expect(fitInside(100, 50, 400, 400)).toEqual({ width: 100, height: 50 })
    expect(fitInside(300, 100, 150, 150)).toEqual({ width: 150, height: 50 })
  })
})
