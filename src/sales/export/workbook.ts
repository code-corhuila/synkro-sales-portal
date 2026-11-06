import type { Sale } from '../model/sale'
import { safeText } from './safeText'

export async function buildSalesWorkbook(sales: Sale[]): Promise<Blob> {
  const { default: writeWorkbook } = await import('write-excel-file/universal')
  const rows = sales.map((sale) => {
    if (!Number.isSafeInteger(sale.totalCents) || Math.abs(sale.totalCents) > 999_999_999_999_999) {
      throw new Error('El importe supera la precisión admitida por Excel.')
    }
    const day = new Date(sale.date).toISOString().slice(0, 10)
    return [safeText(sale.saleId), day, { value: sale.totalCents / 100, format: '#,##0.00' }]
  })
  return writeWorkbook([['Referencia', 'Fecha UTC', 'Total COP'], ...rows], {
    sheet: 'Historial',
    columns: [{ width: 39 }, { width: 16 }, { width: 16 }],
  }).toBlob()
}
