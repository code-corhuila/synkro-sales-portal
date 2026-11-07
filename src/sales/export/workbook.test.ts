// @vitest-environment node
import { Workbook } from 'exceljs'
import { buildSalesWorkbook } from './workbook'
import type { Sale } from '../model/sale'

it('produce un libro con fechas UTC, dinero numérico y referencia de texto', async () => {
  const sale: Sale = { saleId: '=1+1', customerId: 'customer', createdBy: 'seller',
    date: '2026-11-05T23:00:00-05:00', totalCents: 123456, active: true, details: [] }
  const output = await buildSalesWorkbook([sale])
  const workbook = new Workbook()
  await workbook.xlsx.load(await output.arrayBuffer() as never)
  const rows = workbook.getWorksheet('Historial')
  expect(rows?.getCell('A1').value).toBe('Referencia')
  expect(rows?.getCell('A2').value).toBe("'=1+1")
  expect(rows?.getCell('B2').value).toBe('2026-11-06')
  expect(rows?.getCell('C2').value).toBe(1234.56)
})
