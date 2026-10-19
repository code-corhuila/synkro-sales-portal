import { useId, useState } from 'react'
import type { RegisterSaleRequest } from '../model/saleForm'
import { useRegisterSale } from '../pages/useRegisterSale'
import { SagaStatus } from './SagaStatus'
import { SaleForm } from './SaleForm'
import styles from './NewSalePanel.module.css'

// The "Nueva venta" section of /sales: the form, the saga outcome above it, and nothing else.
// Sales are started only through Workflow; `onRegistered` lets the screen refresh the history.
export function NewSalePanel({ onRegistered, active = true }: { onRegistered: (saleId: string) => void; active?: boolean }) {
  const title = useId()
  const [formGeneration, setFormGeneration] = useState(0)
  const [latest, setLatest] = useState<RegisterSaleRequest | null>(null)
  const registration = useRegisterSale({
    active,
    // A confirmed sale empties the form so the same lines cannot be sent twice by accident.
    onCompleted: (saleId) => { setFormGeneration((value) => value + 1); onRegistered(saleId) },
  })
  const { trackDraft } = registration
  return <section aria-labelledby={title} className={styles.panel}>
    <h2 id={title} className={styles.title}>Nueva venta</h2>
    <SagaStatus state={registration.state} sale={registration.sale} canRetry={latest !== null}
      onRetry={() => { if (latest) registration.submit(latest) }}
      onResume={registration.resume} onDismiss={registration.dismiss} />
    <SaleForm key={formGeneration} pending={registration.pending} blockedReason={registration.blockedReason}
      onSubmit={registration.submit} onClear={registration.clear}
      onDraftChange={(request) => { setLatest(request); trackDraft(request) }} />
  </section>
}
