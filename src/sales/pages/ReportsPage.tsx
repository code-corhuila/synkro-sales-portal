import { useId, useState } from 'react'
import { session } from 'shell/session'
import type { FilterErrors, SalesFilters } from '../model/filters'
import { REPORT_TEXT, canReadReports, type ReportKind } from '../model/report'
import { ReportFilterBar } from '../components/ReportFilterBar'
import { ReportEmpty, ReportError } from '../components/ReportStates'
import { ReportPagination } from '../components/ReportPagination'
import { ReportTable } from '../components/ReportTable'
import { ReportTableSkeleton } from '../components/ReportTableSkeleton'
import { SalesSections } from '../components/SalesSections'
import { useProductNames, useReport } from './useReport'
import styles from './SalesPage.module.css'

// The daily, monthly and top-products reports. The server decides what the person sees
// (a SALESPERSON only gets their own contribution); this screen only presents it.
export function ReportsPage({ kind }: { kind: ReportKind }) {
  const role = session.user()?.role
  const allowed = canReadReports(role)
  // A role the API does not serve is told so, and no request is made on its behalf.
  const report = useReport(kind, { enabled: allowed })
  const [draft, setDraft] = useState<SalesFilters>({})
  const [errors, setErrors] = useState<FilterErrors>({})
  const title = useId()
  const filtered = Boolean(report.query.from || report.query.to)
  const clear = () => { setDraft({}); setErrors({}); report.applyFilters({}) }
  const rows = report.state.status === 'ready' ? report.state.value.data : []
  const names = useProductNames(kind === 'top-products' ? rows.map((row) => (row as { productId: string }).productId) : [])

  return <section className={styles.page}>
    <header className={styles.header}>
      <h1 className={styles.title}>{REPORT_TEXT[kind].title}</h1>
      <p className={styles.subtitle}>{role === 'SALESPERSON' ? 'Consulta tu contribución a las ventas.' : 'Consulta los totales de todas las ventas.'}</p>
      <SalesSections current={kind} />
    </header>
    {!allowed ? <div role="alert" className={styles.notice}>
      <p className={styles.noticeText}>No tienes permiso para consultar los reportes de ventas.</p>
    </div> : <section aria-labelledby={title} className={styles.history}>
      <h2 id={title} className={styles.historyTitle}>{REPORT_TEXT[kind].table}</h2>
      <ReportFilterBar filters={draft} errors={errors} onChange={setDraft} onErrors={setErrors} onApply={report.applyFilters} onClear={clear} />
      {report.state.status === 'loading' && <ReportTableSkeleton kind={kind} />}
      {report.state.status === 'error' && <ReportError error={report.state.error} onRetry={report.retry} />}
      {report.state.status === 'ready' && <>
        {rows.length ? <ReportTable kind={kind} rows={rows} names={names} /> : <ReportEmpty filtered={filtered} onClear={clear} />}
        <ReportPagination kind={kind} meta={report.state.value.meta} onPage={report.goToPage} />
      </>}
    </section>}
  </section>
}
