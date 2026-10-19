import { useId, useState } from 'react'
import { findCustomersByDocument } from '../api/customersApi'
import type { Customer } from '../model/customer'
import { Button } from './Button'
import field from './Field.module.css'
import styles from './SaleForm.module.css'
import { useSearch } from './useSearch'

interface Props {
  customer: Customer | null
  error?: string
  onSelect: (customer: Customer | null) => void
}

// Customers has a single documented lookup for a sale: the exact identity document.
export function CustomerPicker({ customer, error, onSelect }: Props) {
  const id = useId()
  const [document, setDocument] = useState('')
  const [local, setLocal] = useState<string>()
  const { state, search } = useSearch((term, signal) => findCustomersByDocument(term, { signal }))
  const message = local ?? error
  const run = () => {
    const term = document.trim()
    if (!term || term.length > 30) { setLocal('Ingresa el documento del cliente (hasta 30 caracteres).'); return }
    setLocal(undefined)
    search(term)
  }

  if (customer) {
    return <div className={styles.picker}>
      <span className={field.label}>Cliente</span>
      <div className={styles.result}>
        <div className={styles.resultText}>
          <span className={styles.name}>{customer.name}</span>
          <span className={styles.mono}>Documento {customer.identityDocument}</span>
        </div>
        <Button variant="secondary" size="small" onClick={() => onSelect(null)}>Cambiar cliente</Button>
      </div>
    </div>
  }

  const found = state.status === 'ready' ? state.value[0] : undefined
  return <div className={styles.picker}>
    <div className={styles.searchRow}>
      <div className={field.field}>
        <label className={field.label} htmlFor={`${id}-document`}>Documento del cliente</label>
        <input id={`${id}-document`} value={document} autoComplete="off" maxLength={30}
          aria-invalid={Boolean(message)} aria-describedby={`${id}-hint`}
          onChange={(event) => { setLocal(undefined); setDocument(event.target.value) }}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); run() } }} />
        <p id={`${id}-hint`} className={message ? field.error : field.hint}>{message ?? 'Cédula o NIT exacto del cliente.'}</p>
      </div>
      <Button variant="secondary" onClick={run} disabled={state.status === 'loading'}>Buscar cliente</Button>
    </div>
    {state.status === 'loading' && <p role="status" className={styles.note}>Buscando cliente…</p>}
    {state.status === 'error' && <p role="alert" className={styles.errorNote}>No se pudo buscar el cliente. Inténtalo de nuevo.</p>}
    {state.status === 'ready' && !found && <p role="status" className={styles.note}>No se encontró un cliente con ese documento.</p>}
    {found && <div className={styles.result}>
      <div className={styles.resultText}>
        <span className={styles.name}>{found.name}</span>
        <span className={styles.mono}>Documento {found.identityDocument}</span>
        {!found.active && <span className={styles.errorNote}>Este cliente está inactivo y no puede usarse en una venta nueva.</span>}
      </div>
      {found.active && <Button variant="secondary" size="small" onClick={() => onSelect(found)}>Seleccionar cliente</Button>}
    </div>}
  </div>
}
