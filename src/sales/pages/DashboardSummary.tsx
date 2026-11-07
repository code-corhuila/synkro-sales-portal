import type { ReactNode } from 'react'
import { session } from 'shell/session'
import { reportPath } from '../../navigation'
import { PortalLink } from '../components/PortalLink'
import { Button } from '../components/Button'
import { reportFailureMessage } from '../components/ReportStates'
import { formatCents } from '../model/formatting'
import { canReadReports, type ReportKind, type ReportRows } from '../model/report'
import { countLabel, formatUtcDay, formatUtcMonth } from '../model/reportFormatting'
import { DashboardTrend } from './DashboardTrend'
import { useProductNames, useReport } from './useReport'
import styles from './DashboardSummary.module.css'

// The Host mounts this on /dashboard (federated `./DashboardSummary`). It shows the newest
// group of each report the API already exposes, with no figure of its own: the server scopes
// a SALESPERSON to their own contribution, and an empty answer is said, not turned into zeros.
export default function DashboardSummary() {
  const role = session.user()?.role
  // INVENTORY (or no role) gets nothing and asks for nothing.
  if (!canReadReports(role)) return null
  return <section aria-labelledby="sales-summary-title" className={styles.summary}>
    <h3 id="sales-summary-title" className={styles.heading}>{role === 'SALESPERSON' ? 'Tu contribución' : 'Resumen de ventas'}</h3>
    <div className={styles.tiles}>
      <Tile kind="daily" title="Último día con ventas" limit={1}>{(rows) => {
        const row = rows[0] as ReportRows['daily']
        return <>
          <p className={styles.value}>{formatCents(row.dailyTotalCents)}</p>
          <p className={styles.detail}>{formatUtcDay(row.day)} · {countLabel(row.saleCount, 'venta', 'ventas')}</p>
        </>
      }}</Tile>
      <Tile kind="monthly" title="Mes más reciente" limit={1}>{(rows) => {
        const row = rows[0] as ReportRows['monthly']
        return <>
          <p className={styles.value}>{formatCents(row.monthlyTotalCents)}</p>
          <p className={styles.detail}>{formatUtcMonth(row.month)} · {countLabel(row.saleCount, 'venta', 'ventas')}</p>
        </>
      }}</Tile>
      <Tile kind="top-products" title="Productos más vendidos" limit={3}>{(rows) => <TopList rows={rows as ReportRows['top-products'][]} />}</Tile>
    </div>
    <DashboardTrend />
  </section>
}

function TopList({ rows }: { rows: ReportRows['top-products'][] }) {
  const names = useProductNames(rows.map((row) => row.productId))
  return <>
    <ul className={styles.list}>
      {rows.map((row) => <li key={row.productId} className={styles.item}>
        {names[row.productId] ? <span className={styles.itemName}>{names[row.productId]}</span> : null}
        {!names[row.productId] && <span className={styles.itemId}>{row.productId}</span>}
        <span className={styles.detail}>{countLabel(row.totalQuantity, 'unidad', 'unidades')} · {formatCents(row.totalRevenueCents)}</span>
      </li>)}
    </ul>
    <p className={styles.detail}>Todo el historial.</p>
  </>
}

const LINK_LABEL: Record<ReportKind, string> = { daily: 'Ver reporte diario', monthly: 'Ver reporte mensual', 'top-products': 'Ver productos más vendidos' }

// One tile = one request and its own four states, so a failing endpoint does not hide the others.
function Tile({ kind, title, limit, children }: { kind: ReportKind; title: string; limit: number; children: (rows: ReportRows[ReportKind][]) => ReactNode }) {
  const report = useReport(kind, { limit })
  const { state } = report
  return <section aria-label={title} className={styles.tile}>
    <h4 className={styles.tileTitle}>{title}</h4>
    {state.status === 'loading' && <p role="status" className={styles.detail}>Cargando…</p>}
    {state.status === 'error' && <TileError error={state.error} onRetry={report.retry} />}
    {state.status === 'ready' && (state.value.data.length ? children(state.value.data) : <p className={styles.detail}>Todavía no hay ventas registradas.</p>)}
    <PortalLink href={reportPath(kind)} className={styles.more}>{LINK_LABEL[kind]}</PortalLink>
  </section>
}

function TileError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { message, retryable } = reportFailureMessage(error, 'No se pudo cargar este resumen.')
  return <div role="alert">
    <p className={styles.detail}>{message}</p>
    {retryable && <Button variant="secondary" size="small" onClick={onRetry}>Reintentar</Button>}
  </div>
}
