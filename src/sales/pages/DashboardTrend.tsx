import { useState } from 'react'
import { Button } from '../components/Button'
import { ReportFilterBar } from '../components/ReportFilterBar'
import { ReportEmpty, ReportError } from '../components/ReportStates'
import { ReportPagination } from '../components/ReportPagination'
import { ReportTable } from '../components/ReportTable'
import { ReportTableSkeleton } from '../components/ReportTableSkeleton'
import { BarChart, type ChartBar } from '../components/SalesTrendChart'
import type { FilterErrors, SalesFilters } from '../model/filters'
import { formatCents } from '../model/formatting'
import { REPORT_TEXT, SERIES_KINDS, type ReportKind, type ReportRows, type SeriesKind } from '../model/report'
import { formatUtcDay, formatUtcMonth, visibleScopeLabel } from '../model/reportFormatting'
import { useProductNames, useReport, type ReportState } from './useReport'
import styles from './DashboardTrend.module.css'

const TOP_PRODUCTS_LIMIT = 5

// The interactive piece of the dashboard summary: one shared, inclusive UTC range drives a
// daily/monthly series (toggled without losing the range, since both kinds share one `useReport`
// call) and an independent top-products panel, filtered by the same range. Unlike the three
// static tiles above, this reads report data for the range the person picked, not "the newest".
export function DashboardTrend() {
  const [seriesKind, setSeriesKind] = useState<SeriesKind>('daily')
  const [draft, setDraft] = useState<SalesFilters>({})
  const [errors, setErrors] = useState<FilterErrors>({})
  const series = useReport(seriesKind)
  const top = useReport('top-products', { limit: TOP_PRODUCTS_LIMIT })
  const filtered = Boolean(series.query.from || series.query.to)

  function applyBoth(filters: SalesFilters) {
    series.applyFilters(filters)
    top.applyFilters(filters)
  }
  function clearBoth() {
    setDraft({})
    setErrors({})
    applyBoth({})
  }

  return <section aria-labelledby="sales-trend-title" className={styles.trend}>
    <h4 id="sales-trend-title" className={styles.title}>Tendencia de ventas</h4>
    <ReportFilterBar filters={draft} errors={errors} onChange={setDraft} onErrors={setErrors} onApply={applyBoth} onClear={clearBoth} />
    <div role="group" aria-label="Agrupar la tendencia por" className={styles.toggle}>
      {SERIES_KINDS.map((kind) => (
        <Button key={kind} variant={seriesKind === kind ? 'primary' : 'secondary'} size="small"
          aria-pressed={seriesKind === kind} onClick={() => {
            if (kind === seriesKind) return
            series.applyFilters(series.query)
            setSeriesKind(kind)
          }}>{REPORT_TEXT[kind].nav}</Button>
      ))}
    </div>
    <SeriesPanel kind={seriesKind} state={series.state} onRetry={series.retry} onPage={series.goToPage} filtered={filtered} onClear={clearBoth} />
    <TopProductsPanel state={top.state} onRetry={top.retry} onPage={top.goToPage} filtered={filtered} onClear={clearBoth} />
  </section>
}

interface PanelProps<K extends ReportKind> {
  state: ReportState<K>
  onRetry: () => void
  onPage: (page: number) => void
  filtered: boolean
  onClear: () => void
}

function SeriesPanel({ kind, state, onRetry, onPage, filtered, onClear }: PanelProps<SeriesKind> & { kind: SeriesKind }) {
  const { table, singular, plural } = REPORT_TEXT[kind]
  return <div className={styles.panel}>
    <h5 className={styles.panelTitle}>{table}</h5>
    {state.status === 'loading' && <ReportTableSkeleton kind={kind} />}
    {state.status === 'error' && <ReportError error={state.error} whatFailed="No se pudo cargar la tendencia de ventas." onRetry={onRetry} />}
    {state.status === 'ready' && (state.value.data.length ? <>
      <BarChart bars={seriesBars(kind, state.value.data)} format={formatCents} caption={`${table}, página ${state.value.meta.page} de ${state.value.meta.totalPages}`} />
      <ReportTable kind={kind} rows={state.value.data} />
      <p className={styles.note}>{visibleScopeLabel(state.value.data.length, state.value.meta, singular, plural)}</p>
      <ReportPagination kind={kind} meta={state.value.meta} onPage={onPage} label="Paginación de la tendencia" />
    </> : <ReportEmpty filtered={filtered} onClear={onClear} />)}
  </div>
}

function seriesBars(kind: SeriesKind, rows: ReportRows[SeriesKind][]): ChartBar[] {
  const bars = kind === 'daily'
    ? (rows as ReportRows['daily'][]).map((row) => ({ key: row.day, label: formatUtcDay(row.day), value: row.dailyTotalCents }))
    : (rows as ReportRows['monthly'][]).map((row) => ({ key: row.month, label: formatUtcMonth(row.month), value: row.monthlyTotalCents }))
  return bars.sort((left, right) => left.key.localeCompare(right.key))
}

function TopProductsPanel({ state, onRetry, onPage, filtered, onClear }: PanelProps<'top-products'>) {
  const { table, singular, plural } = REPORT_TEXT['top-products']
  const rows = state.status === 'ready' ? state.value.data : []
  const names = useProductNames(rows.map((row) => row.productId))
  return <div className={styles.panel}>
    <h5 className={styles.panelTitle}>{table}</h5>
    {state.status === 'loading' && <ReportTableSkeleton kind="top-products" />}
    {state.status === 'error' && <ReportError error={state.error} whatFailed="No se pudieron cargar los productos más vendidos." onRetry={onRetry} />}
    {state.status === 'ready' && (rows.length ? <>
      <BarChart bars={rows.map((row) => ({ key: row.productId, label: names[row.productId] ?? row.productId, value: row.totalQuantity }))} caption={`${table}, página ${state.value.meta.page} de ${state.value.meta.totalPages}`} />
      <ReportTable kind="top-products" rows={rows} names={names} />
      <p className={styles.note}>{visibleScopeLabel(rows.length, state.value.meta, singular, plural)}</p>
      <ReportPagination kind="top-products" meta={state.value.meta} onPage={onPage} label="Paginación de productos más vendidos" />
    </> : <ReportEmpty filtered={filtered} onClear={onClear} />)}
  </div>
}
