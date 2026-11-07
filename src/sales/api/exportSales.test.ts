import { listSales } from './salesApi'
import { listAllMatchingSales } from './exportSales'
import type { Sale } from '../model/sale'

vi.mock('./salesApi', () => ({ listSales: vi.fn() }))
const list = vi.mocked(listSales)
const sale = (saleId: string): Sale => ({
  saleId, customerId: 'customer', createdBy: 'seller', date: '2026-11-06T02:00:00Z',
  totalCents: 123456, active: true, details: [],
})
const first = Array.from({ length: 20 }, (_, index) => sale(`row-${index}`))
const meta = { page: 1, limit: 20, total: 21, totalPages: 2 }
beforeEach(() => { list.mockReset() })

it('recorre las páginas del historial con el rango aplicado', async () => {
  list.mockResolvedValueOnce({ data: first, meta })
    .mockResolvedValueOnce({ data: [sale('last')], meta: { ...meta, page: 2 } })
  const signal = new AbortController().signal
  await expect(listAllMatchingSales({ from: '2026-11-01', to: '2026-11-06' }, signal)).resolves.toHaveLength(21)
  expect(list).toHaveBeenLastCalledWith({ page: 2, from: '2026-11-01', to: '2026-11-06' }, { signal })
})

it('rechaza el archivo si una página posterior pierde autorización', async () => {
  const denied = { status: 403 }
  list.mockResolvedValueOnce({ data: first, meta }).mockRejectedValueOnce(denied)
  await expect(listAllMatchingSales({}, new AbortController().signal)).rejects.toBe(denied)
})

it('detiene la descarga si el conjunto cambia entre páginas', async () => {
  list.mockResolvedValueOnce({ data: first, meta })
    .mockResolvedValueOnce({ data: [sale('row-0')], meta: { ...meta, page: 2 } })
  await expect(listAllMatchingSales({}, new AbortController().signal)).rejects.toThrow('cambiaron')
})
