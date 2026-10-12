import { useId, type ReactNode } from 'react'
import type { Sale } from '../model/sale'
import { formatCents, formatDate } from '../model/formatting'
import { saleDetailPath } from '../../routes'
import { Button } from './Button'
import styles from './SalesTable.module.css'

export function SalesTableRegion({ children, loading = false }: { children: ReactNode; loading?: boolean }) {
  return (
    <div role="region" aria-label="Tabla de ventas" tabIndex={0} className={styles.scroller}>
      <table className={styles.table} aria-label="Historial de ventas" aria-busy={loading}>
        <thead><tr>
          <th scope="col" className={styles.numericHeader}>Fecha</th><th scope="col">Cliente</th>
          <th scope="col" className={styles.numericHeader}>Líneas</th><th scope="col" className={styles.numericHeader}>Total</th>
          <th scope="col" className={styles.endHeader}>Acciones</th>
        </tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function SalesTable({ sales }: { sales: Sale[] }) {
  const hint = useId()
  return <>
    <SalesTableRegion>
      {sales.map((sale) => <tr key={sale.saleId}>
        <td className={styles.numeric}><time dateTime={sale.date}>{formatDate(sale.date)}</time></td>
        <td className={styles.identifier}>{sale.customerId}</td>
        <td className={styles.numeric}>{sale.details.length}</td>
        <td className={styles.numeric}>{formatCents(sale.totalCents)}</td>
        <td className={styles.actionsCell}>
          <Button variant="ghost" size="small" disabled aria-label={`Ver venta ${sale.saleId}`} aria-describedby={hint} data-planned-route={saleDetailPath(sale.saleId)}>Ver</Button>
        </td>
      </tr>)}
    </SalesTableRegion>
    <p id={hint} className={styles.hint}>El detalle de la venta estará disponible en una próxima entrega.</p>
  </>
}
