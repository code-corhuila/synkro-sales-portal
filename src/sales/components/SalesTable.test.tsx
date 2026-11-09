import { render, screen, within } from '@testing-library/react'
import { ids, saleFixture } from '../../test-doubles/fixtures'
import type { CustomerLabel } from '../pages/useCustomerLabels'
import { SalesTable } from './SalesTable'

const withLabel = (label: CustomerLabel) => new Map<string, CustomerLabel>([[ids.customer, label]])
const row = () => screen.getAllByRole('row')[1]

it('muestra el consecutivo comercial como identificación principal y conserva el enlace por saleId', () => {
  render(<SalesTable sales={[saleFixture({ commercialNumber: 'VEN-2026-000007' })]} customers={withLabel({ status: 'loading' })} />)
  const cells = within(row())
  expect(cells.getByText('VEN-2026-000007')).toBeVisible()
  expect(cells.getByRole('link', { name: /Ver venta VEN-2026-000007/ })).toHaveAttribute('href', `/sales/${ids.sale}`)
})

it('una venta sin consecutivo lo dice claramente y no inventa uno', () => {
  render(<SalesTable sales={[saleFixture()]} customers={withLabel({ status: 'loading' })} />)
  expect(within(row()).getByText('Sin consecutivo')).toBeVisible()
  expect(within(row()).queryByText(/VEN-/)).toBeNull()
  expect(within(row()).getByRole('link', { name: `Ver venta ${ids.sale}` })).toBeVisible()
})

it('muestra nombre y documento del cliente en lugar de su UUID', () => {
  render(<SalesTable sales={[saleFixture()]} customers={withLabel({ status: 'ready', name: 'Ana Pérez', document: '1075123456' })} />)
  expect(within(row()).getByText('Ana Pérez')).toBeVisible()
  expect(within(row()).getByText(/1075123456/)).toBeVisible()
  expect(within(row()).queryByText(ids.customer)).toBeNull()
})

it('mientras se consulta indica que carga, sin mostrar el UUID como si fuera el cliente', () => {
  render(<SalesTable sales={[saleFixture()]} customers={withLabel({ status: 'loading' })} />)
  expect(within(row()).getByText('Cargando cliente…')).toBeVisible()
  expect(within(row()).queryByText(ids.customer)).toBeNull()
})

it('si el cliente no se puede leer muestra un estado claro de datos no disponibles', () => {
  render(<SalesTable sales={[saleFixture()]} customers={withLabel({ status: 'unavailable' })} />)
  expect(within(row()).getByText('Datos del cliente no disponibles')).toBeVisible()
  expect(within(row()).queryByText(ids.customer)).toBeNull()
})

it('el encabezado incluye la columna del número de venta', () => {
  render(<SalesTable sales={[saleFixture()]} customers={withLabel({ status: 'loading' })} />)
  expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Número', 'Fecha', 'Cliente', 'Líneas', 'Total', 'Acciones'])
})
