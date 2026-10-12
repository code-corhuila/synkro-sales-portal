import { useId, useState } from 'react'
import { session } from 'shell/session'
import type { FilterErrors, SalesFilters } from '../model/filters'
import { SalesFilterBar } from '../components/SalesFilterBar'
import { SalesTable } from '../components/SalesTable'
import { SalesTableSkeleton } from '../components/SalesTableSkeleton'
import { SalesEmpty } from '../components/SalesEmpty'
import { SalesError } from '../components/SalesError'
import { SalesPagination } from '../components/SalesPagination'
import { useSalesHistory } from './useSalesHistory'
import styles from './SalesPage.module.css'

export function SalesPage() {
  const history = useSalesHistory()
  const [draft, setDraft] = useState<SalesFilters>({})
  const [errors, setErrors] = useState<FilterErrors>({})
  const title = useId()
  const user = session.user()
  const filtered = Boolean(history.query.from || history.query.to || history.query.customerId)
  const clear = () => { setDraft({}); setErrors({}); history.applyFilters({}) }
  return <section className={styles.page}>
    <header className={styles.header}>
      <h1 className={styles.title}>Ventas</h1>
      <p className={styles.subtitle}>{user?.role === 'SALESPERSON' ? 'Consulta el historial de tus ventas.' : 'Consulta el historial de ventas.'}</p>
    </header>
    <section aria-labelledby={title} className={styles.history}>
      <h2 id={title} className={styles.historyTitle}>Historial</h2>
      <SalesFilterBar filters={draft} errors={errors} onChange={setDraft} onErrors={setErrors} onApply={history.applyFilters} onClear={clear} />
      {history.state.status === 'loading' && <SalesTableSkeleton />}
      {history.state.status === 'error' && <SalesError error={history.state.error} onRetry={history.retry} />}
      {history.state.status === 'ready' && <>
        {history.state.value.data.length ? <SalesTable sales={history.state.value.data} /> : <SalesEmpty filtered={filtered} onClear={clear} onReload={history.retry} />}
        <SalesPagination meta={history.state.value.meta} onPage={history.goToPage} />
      </>}
    </section>
  </section>
}
