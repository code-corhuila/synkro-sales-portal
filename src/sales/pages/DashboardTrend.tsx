import { useRef, useState } from 'react'
import { Button } from '../components/Button'
import { DatePresets } from '../components/DatePresets'
import { ReportFilterBar } from '../components/ReportFilterBar'
import { ReportEmpty, ReportError } from '../components/ReportStates'
import { ReportPagination } from '../components/ReportPagination'
import { ReportTable } from '../components/ReportTable'
import { ReportTableSkeleton } from '../components/ReportTableSkeleton'
import { BarChart, RankingBars, type ChartBar } from '../components/SalesTrendChart'
import type { FilterErrors, SalesFilters } from '../model/filters'
import { formatCents } from '../model/formatting'
import { REPORT_TEXT, SERIES_KINDS, type ReportKind, type ReportRows, type SeriesKind } from '../model/report'
import { countLabel, formatUtcDay, formatUtcMonth, visibleScopeLabel } from '../model/reportFormatting'
import { useProductNames, useReport, type ReportState } from './useReport'
import styles from './DashboardTrend.module.css'

const TOP_PRODUCTS_LIMIT = 5

// The interactive piece of the dashboard summary: one shared, inclusive UTC range (manual, or
// one of the quick presets) drives a daily/monthly series (toggled without losing the range,
// since both kinds share one `useReport` call) and an independent top-products ranking, filtered
// by the same range. Unlike the three static tiles above, this reads report data for the range
// the person picked, not "the newest".
export function DashboardTrend() {
  const [seriesKind, setSeriesKind] = useState<SeriesKind>('daily')
  const [draft, setDraft] = useState<SalesFilters>({})
  const [errors, setErrors] = useState<FilterErrors>({})
  const fromRef = useRef<HTMLInputElement>(null)
  const series = useReport(seriesKind)
  const top = useReport('top-products', { limit: TOP_PRODUCTS_LIMIT })
  const filtered = Boolean(series.query.from || series.query.to)

  function applyBoth(filters: SalesFilters) {
    series.applyFilters(filters)
    top.applyFilters(filters)
  }
  function applyPreset(range: SalesFilters) {
    setDraft(range)
    setErrors({})
    applyBoth(range)
  }
  function clearBoth() {
    setDraft({})
    setErrors({})
    applyBoth({})
  }

  return <section aria-labelledby="sales-trend-title" className={styles.trend}>
    <div className={styles.header}>
      <h4 id="sales-trend-title" className={styles.title}>Tendencia de ventas</h4>
      <DatePresets filters={series.query} onPreset={applyPreset} onCustom={() => fromRef.current?.focus()} />
    </div>
    <ReportFilterBar filters={draft} errors={errors} onChange={setDraft} onErrors={setErrors} onApply={applyBoth} onClear={clearBoth} fromRef={fromRef} />
    <div className={styles.row}>
      <div className={styles.panelWide}>
        <div className={styles.panelHeader}>
          <h5 className={styles.panelTitle}>{REPORT_TEXT[seriesKind].table}</h5>
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
        </div>
        <SeriesPanel kind={seriesKind} state={series.state} onRetry={series.retry} onPage={series.goToPage} filtered={filtered} onClear={clearBoth} />
      </div>
      <div className={styles.panelSide}>
        <h5 className={styles.panelTitle}>{REPORT_TEXT['top-products'].table}</h5>
        <p className={styles.note}>Ordenados por unidades vendidas.</p>
        <TopProductsPanel state={top.state} onRetry={top.retry} onPage={top.goToPage} filtered={filtered} onClear={clearBoth} />
      </div>
    </div>
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
    {state.status === 'loading' && <ReportTableSkeleton kind={kind} />}
    {state.status === 'error' && <ReportError error={state.error} whatFailed="No se pudo cargar la tendencia de ventas." onRetry={onRetry} />}
    {state.status === 'ready' && (state.value.data.length ? <>
      <BarChart bars={seriesBars(kind, state.value.data)} format={formatCents} caption={`${table}, página ${state.value.meta.page} de ${state.value.meta.totalPages}`} />
      <details open className={styles.disclosure}>
        <summary className={styles.summary}>Ver tabla de datos</summary>
        <ReportTable kind={kind} rows={state.value.data} />
      </details>
      <p className={styles.note}>{visibleScopeLabel(state.value.data.length, state.value.meta, singular, plural)}</p>
      <ReportPagination kind={kind} meta={state.value.meta} onPage={onPage} label="Paginación de la tendencia" />
    </> : <ReportEmpty filtered={filtered} onClear={onClear} />)}
  </div>
}

function seriesBars(kind: SeriesKind, rows: ReportRows[SeriesKind][]): ChartBar[] {
  const bars = kind === 'daily'
    ? (rows as ReportRows['daily'][]).map((row) => ({ key: row.day, label: formatUtcDay(row.day), value: row.dailyTotalCents, detail: countLabel(row.saleCount, 'venta', 'ventas') }))
    : (rows as ReportRows['monthly'][]).map((row) => ({ key: row.month, label: formatUtcMonth(row.month), value: row.monthlyTotalCents, detail: countLabel(row.saleCount, 'venta', 'ventas') }))
  return bars.sort((left, right) => left.key.localeCompare(right.key))
}

function TopProductsPanel({ state, onRetry, onPage, filtered, onClear }: PanelProps<'top-products'>) {
  const { singular, plural } = REPORT_TEXT['top-products']
  const rows = state.status === 'ready' ? state.value.data : []
  const names = useProductNames(rows.map((row) => row.productId))
  return <div className={styles.panel}>
    {state.status === 'loading' && <ReportTableSkeleton kind="top-products" />}
    {state.status === 'error' && <ReportError error={state.error} whatFailed="No se pudieron cargar los productos más vendidos." onRetry={onRetry} />}
    {state.status === 'ready' && (rows.length ? <>
      <RankingBars bars={rows.map((row) => ({ key: row.productId, label: names[row.productId] ?? row.productId, value: row.totalQuantity, detail: formatCents(row.totalRevenueCents) }))} format={(quantity) => countLabel(quantity, 'unidad', 'unidades')} />
      <details open className={styles.disclosure}>
        <summary className={styles.summary}>Ver tabla de datos</summary>
        <ReportTable kind="top-products" rows={rows} names={names} />
      </details>
      <p className={styles.note}>{visibleScopeLabel(rows.length, state.value.meta, singular, plural)}</p>
      <ReportPagination kind="top-products" meta={state.value.meta} onPage={onPage} label="Paginación de productos más vendidos" />
    </> : <ReportEmpty filtered={filtered} onClear={onClear} />)}
  </div>
}
