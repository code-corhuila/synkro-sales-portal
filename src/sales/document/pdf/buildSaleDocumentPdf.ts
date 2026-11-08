import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { formatCents } from '../../model/formatting'
import { assertRenderable } from '../assertRenderable'
import { sanitizeText } from '../text'
import type { SaleDocument, SaleDocumentLine } from '../types'
import { dataUrlBytes, FONT_DATA, LOGO_DATA, LOGO_SIZE } from './assets'
import { formatBogota } from './format'

// US Letter, in PDF points. The approved layout is specified in CSS pixels (816 x 1056 at 96 ppi): 1 px = 0.75 pt.
export const PDF_PAGE = { width: 612, height: 792, margin: 42 } as const
const px = (value: number) => value * 0.75

// Colours and proportions of the approved HTML reference (factura-opcion-a.html), as design tokens.
const INK = rgb(0x16 / 255, 0x1E / 255, 0x2F / 255)
const RED = rgb(0xB5 / 255, 0x1A / 255, 0x28 / 255)
const RED_DARK = rgb(0x64 / 255, 0x1A / 255, 0x2E / 255)
const RED_TINT = rgb(0xFD / 255, 0xEC / 255, 0xE4 / 255)
const RED_SOFT = rgb(0xF0 / 255, 0xD8 / 255, 0xCC / 255)
const CREAM = rgb(0xFF / 255, 0xF9 / 255, 0xF6 / 255)
const MUTED = rgb(0x4F / 255, 0x4A / 255, 0x52 / 255)
const SECONDARY = rgb(0x7C / 255, 0x64 / 255, 0x5E / 255)
const FOOTER = rgb(0x6B / 255, 0x56 / 255, 0x50 / 255)
const BORDER = rgb(0xE5 / 255, 0xD6 / 255, 0xCE / 255)
const RULE = rgb(0xEA / 255, 0xDD / 255, 0xD6 / 255)
const ERROR = rgb(0xD7 / 255, 0x37 / 255, 0x68 / 255)
const WHITE = rgb(1, 1, 1)

const { width: W, height: H, margin: M } = PDF_PAGE
const CONTENT_WIDTH = W - 2 * M
const FOOTER_HEIGHT = 56
const BODY_BOTTOM = FOOTER_HEIGHT + 14
const HAIRLINE = px(1)

// A font plus the set of characters it really contains. A character the font lacks is printed as "?" instead
// of the .notdef box or a failure; the XML keeps the exact text.
interface Face { font: PDFFont; has: (codePoint: number) => boolean }

export function fitInside(naturalWidth: number, naturalHeight: number, boxWidth: number, boxHeight: number) {
  const scale = Math.min(1, boxWidth / naturalWidth, boxHeight / naturalHeight)
  return { width: naturalWidth * scale, height: naturalHeight * scale }
}

function prepare(face: Face, text: string): string {
  let out = ''
  for (const char of sanitizeText(text).replace(/ /g, ' ')) out += face.has(char.codePointAt(0)!) ? char : '?'
  return out
}

const widthOf = (face: Face, text: string, size: number) => face.font.widthOfTextAtSize(text, size)

// Greedy word wrap. A word wider than the column is broken by characters so nothing is clipped or overflows.
function wrap(face: Face, text: string, size: number, maxWidth: number): string[] {
  const words = prepare(face, text).split(' ').filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (widthOf(face, candidate, size) <= maxWidth) { current = candidate; continue }
    if (current) { lines.push(current); current = '' }
    if (widthOf(face, word, size) <= maxWidth) { current = word; continue }
    let chunk = ''
    for (const char of word) {
      if (chunk && widthOf(face, chunk + char, size) > maxWidth) { lines.push(chunk); chunk = char } else chunk += char
    }
    current = chunk
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

function shrinkToFit(face: Face, text: string, size: number, maxWidth: number, minimum = 6): number {
  let current = size
  while (current > minimum && widthOf(face, text, current) > maxWidth) current -= 0.25
  return current
}

// Baseline of a line box that starts at `top`: half-leading plus the font's ascent (~1 em).
const baseline = (top: number, size: number, lineHeight: number) => top - ((lineHeight - 1.3 * size) / 2 + size)

const money = (cents: number) => formatCents(cents).replace(/ /g, ' ')

async function loadFaces(pdf: PDFDocument) {
  pdf.registerFontkit(fontkit)
  const embed = async (data: string): Promise<Face> => {
    const font = await pdf.embedFont(dataUrlBytes(data), { subset: true })
    const characters = new Set(font.getCharacterSet())
    return { font, has: (codePoint) => characters.has(codePoint) }
  }
  return {
    sans: await embed(FONT_DATA.sans), semibold: await embed(FONT_DATA.sansSemibold), bold: await embed(FONT_DATA.sansBold),
    mono: await embed(FONT_DATA.mono), monoBold: await embed(FONT_DATA.monoBold), display: await embed(FONT_DATA.display),
  }
}
type Faces = Awaited<ReturnType<typeof loadFaces>>

interface TextStyle { face: Face; size: number; color: ReturnType<typeof rgb> }

function drawText(page: PDFPage, text: string, x: number, y: number, { face, size, color }: TextStyle, align: 'left' | 'right' = 'left') {
  const prepared = prepare(face, text)
  if (!prepared) return
  const left = align === 'right' ? x - widthOf(face, prepared, size) : x
  page.drawText(prepared, { x: left, y, size, font: face.font, color })
}

export async function buildSaleDocumentPdf(model: SaleDocument): Promise<Uint8Array> {
  assertRenderable(model)
  const pdf = await PDFDocument.create()
  const faces = await loadFaces(pdf)
  const logo = await pdf.embedPng(dataUrlBytes(LOGO_DATA))
  const generated = new Date(model.generatedAt)
  pdf.setTitle(`Comprobante de venta ${model.saleId}`)
  pdf.setSubject('Comprobante de venta de alcance comercial')
  pdf.setAuthor(sanitizeText(model.issuer.legalName))
  pdf.setCreator('Synkro Sales Portal')
  pdf.setProducer('Synkro Sales Portal (pdf-lib)')
  pdf.setCreationDate(generated)
  pdf.setModificationDate(generated)

  const pages: PDFPage[] = []
  let page!: PDFPage
  let y = 0

  // ── Column geometry: amount columns grow with the widest amount so big totals never overflow ──
  const amountTexts = model.lines.flatMap((line) => [money(line.unitPriceCents), money(line.subtotalCents)])
  const amountWidth = Math.min(170, Math.max(px(128), ...amountTexts.map((text) => widthOf(faces.monoBold, text, 9)).map((value) => value + px(20))))
  const quantityWidth = Math.min(80, Math.max(px(56), ...model.lines.map((line) => widthOf(faces.mono, String(line.quantity), 9) + px(20))))
  const indexWidth = px(40)
  const descriptionWidth = CONTENT_WIDTH - indexWidth - quantityWidth - 2 * amountWidth
  const cellPad = px(10)
  const columns = {
    index: M, description: M + indexWidth, quantity: M + indexWidth + descriptionWidth,
    unit: M + indexWidth + descriptionWidth + quantityWidth, subtotal: M + indexWidth + descriptionWidth + quantityWidth + amountWidth,
  }

  // ── Headers ─────────────────────────────────────────────────────────────────────────────────
  function drawFirstHeader() {
    const box = fitInside(LOGO_SIZE.width, LOGO_SIZE.height, px(148), px(92))
    const cardWidth = box.width + px(20)
    const cardHeight = box.height + px(12)
    const textWidth = CONTENT_WIDTH - cardWidth - px(24)
    const tag = wrap(faces.semibold, model.issuer.legalName.toUpperCase(), 9, textWidth)
    const titleText = 'COMPROBANTE DE VENTA'
    const titleSize = shrinkToFit(faces.display, titleText, px(50), textWidth)
    const idText = `Venta ${model.saleId}`
    const idSize = shrinkToFit(faces.mono, idText, 10, textWidth)
    const blockHeight = tag.length * 11 + 5 + titleSize * 0.95 + 6 + 13
    const content = Math.max(cardHeight, blockHeight)
    const band = px(36) + content + px(30)
    page.drawRectangle({ x: 0, y: H - band, width: W, height: band, color: INK })
    page.drawRectangle({ x: 0, y: H - band - px(6), width: W, height: px(6), color: RED })
    const cardTop = H - px(36) - (content - cardHeight) / 2
    page.drawRectangle({ x: M, y: cardTop - cardHeight, width: cardWidth, height: cardHeight, color: WHITE })
    page.drawImage(logo, { x: M + px(10), y: cardTop - px(6) - box.height, width: box.width, height: box.height })
    let top = H - px(36) - (content - blockHeight) / 2
    for (const line of tag) { drawText(page, line, W - M, baseline(top, 9, 11), { face: faces.semibold, size: 9, color: RED_SOFT }, 'right'); top -= 11 }
    top -= 5
    drawText(page, titleText, W - M, top - titleSize * 0.8, { face: faces.display, size: titleSize, color: WHITE }, 'right')
    top -= titleSize * 0.95 + 6
    drawText(page, idText, W - M, baseline(top, idSize, 13), { face: faces.mono, size: idSize, color: WHITE }, 'right')
    y = H - band - px(6) - px(26)
  }

  function drawContinuationHeader() {
    const band = 34
    page.drawRectangle({ x: 0, y: H - band, width: W, height: band, color: INK })
    page.drawRectangle({ x: 0, y: H - band - 3, width: W, height: 3, color: RED })
    drawText(page, 'COMPROBANTE DE VENTA', M, H - band + 11, { face: faces.display, size: 17, color: WHITE })
    const id = `Venta ${model.saleId} · continuación`
    drawText(page, id, W - M, H - band + 12, { face: faces.mono, size: shrinkToFit(faces.mono, id, 8, CONTENT_WIDTH - 190), color: RED_SOFT }, 'right')
    y = H - band - 3 - px(22)
  }

  const label = (text: string, x: number, top: number, color = SECONDARY) => drawText(page, text.toUpperCase(), x, baseline(top, 8.25, 10), { face: faces.semibold, size: 8.25, color })

  function drawTableHeader() {
    const height = px(10) * 2 + 8.25 * 1.2
    page.drawRectangle({ x: M, y: y - height, width: CONTENT_WIDTH, height, color: RED_TINT })
    page.drawRectangle({ x: M, y: y - height, width: CONTENT_WIDTH, height: px(2), color: RED })
    const top = y - px(10)
    label('#', columns.index + cellPad, top, RED_DARK)
    label('Descripción', columns.description + cellPad, top, RED_DARK)
    drawText(page, 'CANT.', columns.unit - cellPad, baseline(top, 8.25, 10), { face: faces.semibold, size: 8.25, color: RED_DARK }, 'right')
    drawText(page, 'VALOR UNITARIO', columns.subtotal - cellPad, baseline(top, 8.25, 10), { face: faces.semibold, size: 8.25, color: RED_DARK }, 'right')
    drawText(page, 'SUBTOTAL', W - M - cellPad, baseline(top, 8.25, 10), { face: faces.semibold, size: 8.25, color: RED_DARK }, 'right')
    y -= height
  }

  function newPage(withTableHeader: boolean) {
    page = pdf.addPage([W, H])
    pages.push(page)
    drawContinuationHeader()
    if (withTableHeader) drawTableHeader()
  }

  // ── First page ──────────────────────────────────────────────────────────────────────────────
  page = pdf.addPage([W, H])
  pages.push(page)
  drawFirstHeader()

  // Sale facts. Dates are shown in America/Bogota; the generation date is a different date.
  {
    const columnWidth = CONTENT_WIDTH / 3
    const top = y
    const facts: [string, string, boolean][] = [
      ['Fecha de venta (Colombia)', formatBogota(model.saleDate), false],
      ['Generado el (Colombia)', formatBogota(model.generatedAt), false],
      ['Estado de la venta', model.status === 'VOIDED' ? 'Anulada' : 'Activa', model.status === 'VOIDED'],
    ]
    facts.forEach(([name, value, alert], index) => {
      const x = M + index * columnWidth
      label(name, x, top)
      drawText(page, value, x, baseline(top - 13, 10.5, 13), { face: index < 2 ? faces.mono : faces.semibold, size: 10.5, color: alert ? ERROR : INK })
    })
    y = top - 13 - 13 - px(18)
    page.drawRectangle({ x: M, y, width: CONTENT_WIDTH, height: HAIRLINE, color: BORDER })
    y -= px(22)
  }

  // Issuer and customer boxes.
  {
    const gap = px(16)
    const boxWidth = (CONTENT_WIDTH - gap) / 2
    const inner = boxWidth - 2 * px(18)
    interface Row { text: string; style: TextStyle; lineHeight: number }
    const rows = (role: string, name: string, documentLabel: string, documentValue: string, optional: (string | undefined)[]): Row[] => [
      { text: role, style: { face: faces.bold, size: 8.25, color: RED }, lineHeight: 11 },
      ...wrap(faces.semibold, name, 12, inner).map((text) => ({ text, style: { face: faces.semibold, size: 12, color: INK }, lineHeight: 15.5 })),
      ...wrap(faces.mono, `${documentLabel} ${documentValue}`, 9.75, inner).map((text) => ({ text, style: { face: faces.mono, size: 9.75, color: INK }, lineHeight: 13 })),
      ...optional.filter((value): value is string => Boolean(value)).flatMap((value) => wrap(faces.sans, value, 9.75, inner)).map((text) => ({ text, style: { face: faces.sans, size: 9.75, color: MUTED }, lineHeight: 13 })),
    ]
    const contactLine = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ') || undefined
    const issuerRows = rows('EMISOR', model.issuer.legalName, 'NIT', model.issuer.taxId, [model.issuer.address, contactLine(model.issuer.phone, model.issuer.email)])
    const customerRows = model.customer.currentRecordAvailable === false
      ? rows('CLIENTE', 'Datos actuales no disponibles', 'Referencia', model.customer.customerId, [])
      : rows('CLIENTE', model.customer.name, 'Documento', model.customer.identityDocument, [model.customer.address, contactLine(model.customer.phone, model.customer.email)])
    const heightOf = (list: Row[]) => px(16) * 2 + list.reduce((sum, row) => sum + row.lineHeight, 0) + (list.length - 1) * 3
    const height = Math.max(heightOf(issuerRows), heightOf(customerRows))
    const draw = (list: Row[], x: number, background: boolean) => {
      page.drawRectangle({ x, y: y - height, width: boxWidth, height, color: background ? CREAM : WHITE, borderColor: BORDER, borderWidth: HAIRLINE })
      let top = y - px(16)
      for (const row of list) {
        drawText(page, row.text, x + px(18), baseline(top, row.style.size, row.lineHeight), row.style)
        top -= row.lineHeight + 3
      }
    }
    draw(issuerRows, M, false)
    draw(customerRows, M + boxWidth + gap, true)
    y -= height + px(22)
  }

  // ── Lines table: header repeats on every page, rows are never cut (unless one alone exceeds a page) ──
  drawTableHeader()
  const nameSize = px(13.5)
  const nameLine = nameSize * 1.3
  const categorySize = 9
  const categoryLine = categorySize * 1.3
  const rowPad = px(11)
  const fullBody = H - 34 - 3 - px(22) - BODY_BOTTOM - (10 * 2 + 8.25 * 1.2)

  interface DescriptionLine { text: string; kind: 'name' | 'category' }
  function drawLine(line: SaleDocumentLine, descriptionLines: DescriptionLine[], withNumbers: boolean) {
    const height = rowPad * 2 + descriptionLines.reduce((sum, item) => sum + (item.kind === 'name' ? nameLine : categoryLine), 0)
    let top = y - rowPad
    descriptionLines.forEach((item, index) => {
      const size = item.kind === 'name' ? nameSize : categorySize
      const lineHeight = item.kind === 'name' ? nameLine : categoryLine
      drawText(page, item.text, columns.description + cellPad, baseline(top, size, lineHeight), { face: item.kind === 'name' ? faces.semibold : faces.sans, size, color: item.kind === 'name' ? INK : SECONDARY })
      if (index === 0 && withNumbers) {
        const base = baseline(top, nameSize, nameLine)
        drawText(page, String(line.position).padStart(2, '0'), columns.index + cellPad, base, { face: faces.mono, size: 9, color: SECONDARY })
        drawText(page, String(line.quantity), columns.unit - cellPad, base, { face: faces.mono, size: 9, color: INK }, 'right')
        drawText(page, money(line.unitPriceCents), columns.subtotal - cellPad, base, { face: faces.mono, size: 9, color: INK }, 'right')
        drawText(page, money(line.subtotalCents), W - M - cellPad, base, { face: faces.monoBold, size: 9, color: INK }, 'right')
      }
      top -= lineHeight
    })
    page.drawRectangle({ x: M, y: y - height, width: CONTENT_WIDTH, height: HAIRLINE, color: RULE })
    y -= height
  }

  const heightOfLines = (items: DescriptionLine[]) => rowPad * 2 + items.reduce((sum, item) => sum + (item.kind === 'name' ? nameLine : categoryLine), 0)
  for (const line of model.lines) {
    const items: DescriptionLine[] = [
      ...wrap(faces.semibold, line.productName, nameSize, descriptionWidth - 2 * cellPad).map((text) => ({ text, kind: 'name' as const })),
      ...(line.categoryName ? wrap(faces.sans, line.categoryName, categorySize, descriptionWidth - 2 * cellPad).map((text) => ({ text, kind: 'category' as const })) : []),
    ]
    const height = heightOfLines(items)
    if (height <= fullBody) {
      if (y - height < BODY_BOTTOM) newPage(true)
      drawLine(line, items, true)
      continue
    }
    // One row taller than a whole page: split it between pages by lines; numbers go with the first chunk.
    let remaining = items
    let first = true
    while (remaining.length) {
      let room = y - BODY_BOTTOM - rowPad * 2
      if (room < nameLine * 2) { newPage(true); room = y - BODY_BOTTOM - rowPad * 2 }
      let used = 0
      let count = 0
      while (count < remaining.length) {
        const next = remaining[count].kind === 'name' ? nameLine : categoryLine
        if (used + next > room && count > 0) break
        used += next
        count += 1
      }
      drawLine(line, remaining.slice(0, count), first)
      remaining = remaining.slice(count)
      first = false
      if (remaining.length) newPage(true)
    }
  }

  // ── Summary: counts, total and the scope notice stay together on one page ──────────────────
  {
    const itemLabel = `${model.lines.length} ${model.lines.length === 1 ? 'ítem' : 'ítems'}`
    const unitLabel = `${model.unitCount} ${model.unitCount === 1 ? 'unidad' : 'unidades'}`
    const totalsWidth = px(300)
    const grandHeight = px(14) * 2 + 24
    const noticeWidth = CONTENT_WIDTH
    const noticeInner = noticeWidth - 2 * px(14)
    const noticeLines = [
      { text: 'Comprobante de venta de alcance comercial.', face: faces.bold, color: RED_DARK },
      ...wrap(faces.sans, 'Este documento no es una factura electrónica de venta ni un documento tributario validado: no incluye consecutivo de facturación, CUFE, código QR, resolución ni firma digital, y no discrimina impuestos.', 8.25, noticeInner).map((text) => ({ text, face: faces.sans, color: MUTED })),
      ...wrap(faces.sans, 'Importes en pesos colombianos (COP). Fecha, cantidades, precios y total corresponden a la venta registrada. Cuando están disponibles, los datos del cliente y las descripciones son los vigentes al generar este archivo; en otro caso se indica la referencia y su indisponibilidad.', 8.25, noticeInner).map((text) => ({ text, face: faces.sans, color: MUTED })),
    ]
    const noticeHeight = px(10) * 2 + noticeLines.length * 11.2
    const needed = px(14) + grandHeight + px(16) + noticeHeight
    if (y - needed < BODY_BOTTOM) newPage(false)
    y -= px(14)
    const top = y
    // chips
    let chipX = M
    for (const text of [itemLabel, unitLabel]) {
      const width = widthOf(faces.semibold, prepare(faces.semibold, text), 9) + px(20)
      page.drawRectangle({ x: chipX, y: top - 20, width, height: 20, color: RED_TINT })
      drawText(page, text, chipX + px(10), top - 14, { face: faces.semibold, size: 9, color: RED_DARK })
      chipX += width + px(10)
    }
    // total
    const boxX = W - M - totalsWidth
    page.drawRectangle({ x: boxX, y: top - grandHeight, width: totalsWidth, height: grandHeight, color: RED })
    drawText(page, 'TOTAL', boxX + px(16), top - grandHeight / 2 - 3, { face: faces.bold, size: 9, color: WHITE })
    const totalText = money(model.totalCents)
    const labelRoom = widthOf(faces.bold, 'TOTAL', 9) + px(16) * 3
    const totalSize = shrinkToFit(faces.display, totalText, 24, totalsWidth - labelRoom)
    drawText(page, totalText, boxX + totalsWidth - px(16), top - grandHeight / 2 - totalSize * 0.3, { face: faces.display, size: totalSize, color: WHITE }, 'right')
    y = top - grandHeight - px(16)
    // notice
    page.drawRectangle({ x: M, y: y - noticeHeight, width: noticeWidth, height: noticeHeight, color: CREAM, borderColor: BORDER, borderWidth: HAIRLINE })
    let noticeTop = y - px(10)
    for (const line of noticeLines) {
      drawText(page, line.text, M + px(14), baseline(noticeTop, 8.25, 11.2), { face: line.face, size: 8.25, color: line.color })
      noticeTop -= 11.2
    }
    y -= noticeHeight
  }

  // ── Footer (needs the page count) and the voided stamp on every page ────────────────────────
  pages.forEach((current, index) => {
    page = current
    page.drawRectangle({ x: M, y: FOOTER_HEIGHT, width: CONTENT_WIDTH, height: HAIRLINE, color: RULE })
    const right = [`Generado por Synkro · Sistema de Gestión de Ventas`, `Venta ${model.saleId} · Página ${index + 1} de ${pages.length}`]
    const rightSize = Math.min(...right.map((text) => shrinkToFit(faces.sans, text, 8, CONTENT_WIDTH * 0.62)))
    const rightWidth = Math.max(...right.map((text) => widthOf(faces.sans, prepare(faces.sans, text), rightSize)))
    wrap(faces.sans, 'Gracias por su compra. Conserve este comprobante para cualquier consulta sobre su pedido.', 8, CONTENT_WIDTH - rightWidth - 18)
      .forEach((text, line) => drawText(page, text, M, FOOTER_HEIGHT - 14 - line * 10.5, { face: faces.sans, size: 8, color: FOOTER }))
    right.forEach((text, line) => drawText(page, text, W - M, FOOTER_HEIGHT - 14 - line * 10.5, { face: faces.sans, size: rightSize, color: FOOTER }, 'right'))
    if (model.status === 'VOIDED') drawVoidStamp(page, faces)
  })

  return pdf.save()
}

// "ANULADA", rotated -14 degrees around the centre of the page, as in the reference.
function drawVoidStamp(page: PDFPage, faces: Faces) {
  const size = px(84)
  const text = 'ANULADA'
  const textWidth = widthOf(faces.display, text, size)
  const padX = px(28)
  const padY = px(6)
  const boxWidth = textWidth + 2 * padX
  const boxHeight = size * 0.75 + 2 * padY
  const angle = (-14 * Math.PI) / 180
  const centre = { x: W / 2, y: H / 2 - 20 }
  const rotate = (dx: number, dy: number) => ({ x: centre.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: centre.y + dx * Math.sin(angle) + dy * Math.cos(angle) })
  const corner = rotate(-boxWidth / 2, -boxHeight / 2)
  page.drawRectangle({ x: corner.x, y: corner.y, width: boxWidth, height: boxHeight, rotate: degrees(-14), color: WHITE, opacity: 0.4, borderColor: ERROR, borderWidth: px(5), borderOpacity: 0.8 })
  const origin = rotate(-textWidth / 2, -size * 0.75 / 2 + size * 0.02)
  page.drawText(text, { x: origin.x, y: origin.y, size, font: faces.display.font, color: ERROR, rotate: degrees(-14), opacity: 0.85 })
}
