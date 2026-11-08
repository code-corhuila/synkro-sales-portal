import { downloadBlob } from './downloadBlob'

let created: string[]
let revoked: string[]
let clicked: { href: string; download: string }[]
beforeEach(() => {
  created = []
  revoked = []
  clicked = []
  URL.createObjectURL = vi.fn(() => { const url = `blob:test/${created.length}`; created.push(url); return url })
  URL.revokeObjectURL = vi.fn((url: string) => { revoked.push(url) })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
    const anchor = document.querySelector('a[download]') as HTMLAnchorElement
    clicked.push({ href: anchor.href, download: anchor.download })
  })
})
afterEach(() => vi.restoreAllMocks())

it('crea un único Object URL, inicia la descarga con el nombre indicado y lo libera', () => {
  downloadBlob(new Blob(['x'], { type: 'application/pdf' }), 'comprobante-venta-1.pdf')
  expect(created).toHaveLength(1)
  expect(clicked).toEqual([{ href: created[0], download: 'comprobante-venta-1.pdf' }])
  expect(revoked).toEqual(created)
})

it('no deja anclas temporales en el documento', () => {
  downloadBlob(new Blob(['x']), 'a.xml')
  expect(document.querySelectorAll('a[download]')).toHaveLength(0)
})
