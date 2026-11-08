import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { customerFixture, failure, ids, pageOf, productFixture, saleFixture } from '../../test-doubles/fixtures'
import { issuerEnv } from '../../test-doubles/saleDocument'
import { apiClient } from '../../test-doubles/shellApiClient'
import { session } from '../../test-doubles/shellSession'
import { renderSaleDocument } from '../document/renderSaleDocument'
import { downloadBlob } from '../export/downloadBlob'
import { SaleDetailPage } from './SaleDetailPage'

vi.mock('../export/downloadBlob', () => ({ downloadBlob: vi.fn() }))
vi.mock('../document/renderSaleDocument', () => ({ renderSaleDocument: vi.fn() }))

let sale: () => Promise<unknown>
beforeEach(() => {
  for (const [key, value] of Object.entries(issuerEnv())) vi.stubEnv(key, value)
  session.user.mockReturnValue({ sub: ids.user, role: 'SALESPERSON' })
  sale = () => Promise.resolve(saleFixture())
  vi.mocked(downloadBlob).mockReset()
  vi.mocked(renderSaleDocument).mockReset().mockImplementation(async (kind, model) => ({ blob: new Blob([kind]), fileName: `comprobante-venta-${model.saleId}.${kind}` }))
  apiClient.request.mockReset().mockImplementation((path) => {
    if (path === '/api/v1/products/categories') return Promise.resolve(pageOf([]))
    if (path.startsWith('/api/v1/sales/')) return sale()
    if (path.startsWith('/api/v1/customers/')) return Promise.resolve(customerFixture())
    return Promise.resolve(productFixture())
  })
  window.history.replaceState(null, '', `/sales/${ids.sale}`)
})
afterEach(() => { vi.unstubAllEnvs(); window.history.replaceState(null, '', '/') })

it('ofrece «Descargar PDF» y «Descargar XML» en el detalle una vez cargada la venta', async () => {
  render(<SaleDetailPage saleId={ids.sale} />)
  expect(screen.queryByRole('button', { name: /Descargar/ })).toBeNull()
  expect(await screen.findByRole('button', { name: 'Descargar PDF' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Descargar XML' })).toBeEnabled()
  expect(screen.getByRole('region', { name: 'Documento de la venta' })).toBeVisible()
})

it('descarga el documento de la venta que se está viendo', async () => {
  render(<SaleDetailPage saleId={ids.sale} />)
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Descargar PDF' }))
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))
  expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe(`comprobante-venta-${ids.sale}.pdf`)
})

it('una venta anulada conserva su aviso y el documento se genera como anulado', async () => {
  sale = () => Promise.resolve(saleFixture({ active: false }))
  render(<SaleDetailPage saleId={ids.sale} />)
  expect(await screen.findByText('Esta venta está anulada.')).toBeVisible()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Descargar XML' }))
  await waitFor(() => expect(renderSaleDocument).toHaveBeenCalled())
  expect(vi.mocked(renderSaleDocument).mock.calls[0][1].status).toBe('VOIDED')
})

it('INVENTORY no obtiene descargas por esta función', async () => {
  session.user.mockReturnValue({ sub: ids.user, role: 'INVENTORY' })
  render(<SaleDetailPage saleId={ids.sale} />)
  await screen.findByText('Ana Pérez')
  expect(screen.queryByRole('button', { name: /Descargar/ })).toBeNull()
})

it('no aparece si la venta no existe o hubo un error al cargarla', async () => {
  sale = () => Promise.reject(failure(404, 'NOT_FOUND'))
  const { unmount } = render(<SaleDetailPage saleId={ids.sale} />)
  await screen.findByText('Venta no encontrada')
  expect(screen.queryByRole('button', { name: /Descargar/ })).toBeNull()
  unmount()
  sale = () => Promise.reject(failure(500))
  render(<SaleDetailPage saleId={ids.sale} />)
  await screen.findByRole('alert')
  expect(screen.queryByRole('button', { name: /Descargar/ })).toBeNull()
})
