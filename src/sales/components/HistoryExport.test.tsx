import { fireEvent, render, screen } from '@testing-library/react'
import { listAllMatchingSales } from '../api/exportSales'
import { downloadBlob } from '../export/downloadBlob'
import { buildSalesWorkbook } from '../export/workbook'
import { HistoryExport } from './HistoryExport'

vi.mock('../api/exportSales', () => ({ listAllMatchingSales: vi.fn() }))
vi.mock('../export/workbook', () => ({ buildSalesWorkbook: vi.fn() }))
vi.mock('../export/downloadBlob', () => ({ downloadBlob: vi.fn() }))

beforeEach(() => vi.resetAllMocks())

it('downloads the workbook for the applied date and customer filters', async () => {
  const filters = { from: '2026-11-01', to: '2026-11-06', customerId: 'customer-1' }
  const file = new Blob()
  vi.mocked(listAllMatchingSales).mockResolvedValueOnce([])
  vi.mocked(buildSalesWorkbook).mockResolvedValueOnce(file)
  render(<HistoryExport filters={filters} />)

  fireEvent.click(screen.getByRole('button', { name: 'Descargar Excel' }))

  await screen.findByText('Historial descargado.')
  expect(listAllMatchingSales).toHaveBeenCalledWith(filters, expect.any(AbortSignal))
  expect(buildSalesWorkbook).toHaveBeenCalledWith([])
  expect(downloadBlob).toHaveBeenCalledWith(file, 'historial-ventas.xlsx')
})

it('explains missing permission and allows retry without building a partial workbook', async () => {
  vi.mocked(listAllMatchingSales).mockRejectedValueOnce({ status: 403 })
  render(<HistoryExport filters={{}} />)
  const button = screen.getByRole('button', { name: 'Descargar Excel' })

  fireEvent.click(button)

  expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso')
  expect(button).toBeEnabled()
  expect(buildSalesWorkbook).not.toHaveBeenCalled()
  expect(downloadBlob).not.toHaveBeenCalled()
})
