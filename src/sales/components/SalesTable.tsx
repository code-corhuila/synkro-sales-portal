import type { ReactNode } from 'react'
import type { Sale } from '../model/sale'
import { formatCents, formatDate } from '../model/formatting'
import { saleDetailPath } from '../../navigation'
import type { CustomerLabel } from '../pages/useCustomerLabels'
import { PortalLink } from './PortalLink'
import styles from './SalesTable.module.css'

export function SalesTableRegion({ children, loading = false }: { children: ReactNode; loading?: boolean }) {
  return (
    <div role="region" aria-label="Tabla de ventas" tabIndex={0} className={styles.scroller}>
      <table className={styles.table} aria-label="Historial de ventas" aria-busy={loading}>
        <thead><tr>
          <th scope="col">Número</th><th scope="col" className={styles.numericHeader}>Fecha</th><th scope="col">Cliente</th>
          <th scope="col" className={styles.numericHeader}>Líneas</th><th scope="col" className={styles.numericHeader}>Total</th>
          <th scope="col" className={styles.endHeader}>Acciones</th>
        </tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function CustomerCell({ label }: { label: CustomerLabel | undefined }) {
  if (label?.status === 'ready') return <><span>{label.name}</span><br /><span className={styles.identifier}>Documento {label.document}</span></>
  if (label?.status === 'unavailable') return <span role="status">Datos del cliente no disponibles</span>
  return <span role="status">Cargando cliente…</span>
}

export function SalesTable({ sales, customers }: { sales: Sale[]; customers: ReadonlyMap<string, CustomerLabel> }) {
  return <SalesTableRegion>
    {sales.map((sale) => <tr key={sale.saleId}>
      <td className={styles.identifier}>{sale.commercialNumber ?? 'Sin consecutivo'}</td>
      <td className={styles.numeric}><time dateTime={sale.date}>{formatDate(sale.date)}</time></td>
      <td><CustomerCell label={customers.get(sale.customerId)} /></td>
      <td className={styles.numeric}>{sale.details.length}</td>
      <td className={styles.numeric}>{formatCents(sale.totalCents)}</td>
      <td className={styles.actionsCell}>
        <PortalLink href={saleDetailPath(sale.saleId)} aria-label={`Ver venta ${sale.commercialNumber ?? sale.saleId}`}>Ver</PortalLink>
      </td>
    </tr>)}
  </SalesTableRegion>
}
