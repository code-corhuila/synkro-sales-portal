import { useEffect, useId, useState } from 'react'
import { session } from 'shell/session'
import type { FilterErrors, SalesFilters } from '../model/filters'
import { SalesFilterBar } from '../components/SalesFilterBar'
import { SalesTable } from '../components/SalesTable'
import { SalesTableSkeleton } from '../components/SalesTableSkeleton'
import { SalesEmpty } from '../components/SalesEmpty'
import { SalesError } from '../components/SalesError'
import { SalesPagination } from '../components/SalesPagination'
import { NewSalePanel } from '../components/NewSalePanel'
import { Button } from '../components/Button'
import { clearSalesNotice, peekSalesNotice } from '../../navigation'
import { useSalesHistory } from './useSalesHistory'
import styles from './SalesPage.module.css'

export function SalesPage({ active = true }: { active?: boolean } = {}) {
  const history = useSalesHistory()
  const [draft, setDraft] = useState<SalesFilters>({})
  const [errors, setErrors] = useState<FilterErrors>({})
  const title = useId()
  // Left in the history entry by the detail screen when Sales answered 403; read once, then cleared.
  const [notice, setNotice] = useState(peekSalesNotice)
  useEffect(() => {
    clearSalesNotice()
    // The history stays mounted while a detail is shown, so a redirect back to it arrives as an event.
    const onRedirect = () => { const next = peekSalesNotice(); if (next) { setNotice(next); clearSalesNotice() } }
    window.addEventListener('popstate', onRedirect)
    return () => window.removeEventListener('popstate', onRedirect)
  }, [])
  const user = session.user()
  const filtered = Boolean(history.query.from || history.query.to || history.query.customerId)
  const clear = () => { setDraft({}); setErrors({}); history.applyFilters({}) }
  return <section className={styles.page}>
    <header className={styles.header}>
      <h1 className={styles.title}>Ventas</h1>
      <p className={styles.subtitle}>{user?.role === 'SALESPERSON' ? 'Consulta el historial de tus ventas.' : 'Consulta el historial de ventas.'}</p>
    </header>
    {notice && <div role="alert" className={styles.notice}>
      <p className={styles.noticeText}>No tienes permiso para ver esa venta. Solo puedes consultar las ventas que registraste tú.</p>
      <Button variant="ghost" size="small" onClick={() => setNotice(null)}>Cerrar aviso</Button>
    </div>}
    <NewSalePanel onRegistered={history.refresh} active={active} />
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
