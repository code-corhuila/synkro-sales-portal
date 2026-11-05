import type { ReactNode } from 'react'
import { formatCents } from '../model/formatting'
import { REPORT_TEXT, type ReportKind, type ReportRows } from '../model/report'
import { formatUtcDay, formatUtcMonth } from '../model/reportFormatting'
import styles from './ReportViews.module.css'

const HEADERS: Record<ReportKind, readonly [string, string, string]> = {
  daily: ['Día', 'Ventas', 'Total'],
  monthly: ['Mes', 'Ventas', 'Total'],
  'top-products': ['Producto', 'Cantidad vendida', 'Ingresos'],
}

export function ReportTableRegion({ kind, children, loading = false }: { kind: ReportKind; children: ReactNode; loading?: boolean }) {
  const [first, second, third] = HEADERS[kind]
  return <div role="region" aria-label="Tabla del reporte" tabIndex={0} className={styles.scroller}>
    <table className={styles.table} aria-label={loading ? `${REPORT_TEXT[kind].table} (cargando)` : REPORT_TEXT[kind].table} aria-busy={loading}>
      <thead><tr>
        <th scope="col">{first}</th><th scope="col" className={styles.numericHeader}>{second}</th><th scope="col" className={styles.numericHeader}>{third}</th>
      </tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
}

// `names` are optional product names: a missing one keeps the stored identifier, never an invented name.
export function ReportTable<K extends ReportKind>({ kind, rows, names = {} }: { kind: K; rows: ReportRows[K][]; names?: Record<string, string | null> }) {
  return <ReportTableRegion kind={kind}>
    {kind === 'daily' && (rows as ReportRows['daily'][]).map((row) => <tr key={row.day}>
      <td><time dateTime={row.day}>{formatUtcDay(row.day)}</time></td>
      <td className={styles.numeric}>{row.saleCount}</td>
      <td className={styles.numeric}>{formatCents(row.dailyTotalCents)}</td>
    </tr>)}
    {kind === 'monthly' && (rows as ReportRows['monthly'][]).map((row) => <tr key={row.month}>
      <td><time dateTime={row.month}>{formatUtcMonth(row.month)}</time></td>
      <td className={styles.numeric}>{row.saleCount}</td>
      <td className={styles.numeric}>{formatCents(row.monthlyTotalCents)}</td>
    </tr>)}
    {kind === 'top-products' && (rows as ReportRows['top-products'][]).map((row) => <tr key={row.productId}>
      <td><span className={styles.product}>
        {names[row.productId] ? <span className={styles.productName}>{names[row.productId]}</span> : null}
        <span className={styles.productId}>{row.productId}</span>
      </span></td>
      <td className={styles.numeric}>{row.totalQuantity}</td>
      <td className={styles.numeric}>{formatCents(row.totalRevenueCents)}</td>
    </tr>)}
  </ReportTableRegion>
}
