import { useEffect, useId, useState, type Ref } from 'react'
import { searchCustomers } from '../api/customersApi'
import {
  CUSTOMER_QUERY_MAX, CUSTOMER_QUERY_MIN, CUSTOMER_SUGGESTION_LIMIT as SUGGESTION_LIMIT, customerQueryLength,
  type CustomerChoice, type CustomerSearchResult, type CustomerSuggestion,
} from '../model/customer'
import { Button } from './Button'
import field from './Field.module.css'
import { PortalLink } from './PortalLink'
import styles from './SaleForm.module.css'
import { useSearch } from './useSearch'

export const CUSTOMER_SUGGESTION_LIMIT = SUGGESTION_LIMIT
export const CUSTOMER_DEBOUNCE_MS = 200

interface Props {
  customer: CustomerChoice | null
  error?: string
  onSelect: (customer: CustomerChoice | null) => void
  // The lookup is injectable: the real one is the Customers search contract (see searchCustomers).
  search?: (query: string, signal: AbortSignal) => Promise<CustomerSearchResult>
  inputRef?: Ref<HTMLInputElement>
}

const choiceOf = ({ customerId, name, identityDocument }: CustomerSuggestion): CustomerChoice => ({ customerId, name, identityDocument })

// One autocomplete over the Customers search: debounced, at most five suggestions, arrow keys,
// Enter and Escape. Enter on an exact document selects that customer directly. A late answer for
// an older text is never shown. Suggestions are advisory: the registration (Workflow) decides.
export function CustomerPicker({ customer, error, onSelect, search = (query, signal) => searchCustomers(query, { signal }), inputRef }: Props) {
  const id = useId()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  // The answer remembers the text it answers, so a list for an earlier text is never mistaken for the current one.
  const lookup = useSearch<{ query: string; result: CustomerSearchResult }>(async (query, signal) => ({ query, result: await search(query, signal) }))
  const { search: run, reset } = lookup
  const query = text.trim()
  const length = customerQueryLength(query)
  const searchable = !customer && length >= CUSTOMER_QUERY_MIN

  useEffect(() => {
    if (!searchable) { reset(); return }
    const timer = setTimeout(() => run(query), CUSTOMER_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchable, query, run, reset])

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

  const answered = lookup.state.status === 'ready' && lookup.state.value.query === query ? lookup.state.value.result : null
  const results = searchable && answered ? answered.data.slice(0, CUSTOMER_SUGGESTION_LIMIT) : []
  const hasMore = Boolean(answered?.hasMore)
  const listId = `${id}-list`
  const optionId = (index: number) => `${id}-option-${index}`
  const showList = open && results.length > 0
  const loading = searchable && lookup.state.status === 'loading'
  const failed = searchable && lookup.state.status === 'error'

  function choose(candidate: CustomerSuggestion | undefined) {
    // Defence in depth: the request asks for active customers only, but an inactive one is never selectable.
    if (!candidate || !candidate.active) return
    setOpen(false)
    setActive(-1)
    setText('')
    onSelect(choiceOf(candidate))
  }
  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!results.length) return
      event.preventDefault()
      setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => (current < 0 && step < 0 ? results.length - 1 : (current + step + results.length) % results.length))
    } else if (event.key === 'Escape') {
      if (open) { event.preventDefault(); setOpen(false); setActive(-1) }
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const highlighted = showList && active >= 0 ? results[active] : undefined
      choose(highlighted ?? results.find((item) => item.match === 'DOCUMENT_EXACT'))
    }
  }

  const tooShort = length > 0 && length < CUSTOMER_QUERY_MIN
  return <div className={styles.picker}>
    <div className={field.field}>
      <label className={field.label} htmlFor={`${id}-input`}>Cliente (nombre o documento)</label>
      <input id={`${id}-input`} ref={inputRef} role="combobox" aria-autocomplete="list" aria-expanded={showList} aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint`}
        value={text} autoComplete="off" maxLength={CUSTOMER_QUERY_MAX}
        onChange={(event) => { setText(event.target.value); setOpen(true); setActive(-1) }} onKeyDown={onKeyDown} />
      <p id={`${id}-hint`} className={error ? field.error : field.hint}>
        {error ?? 'Busca por nombre o por documento del cliente.'}
      </p>
    </div>
    <ul id={listId} role="listbox" aria-label="Sugerencias de clientes" hidden={!showList} className={styles.lines}>
      {results.map((item, index) => <li key={item.customerId} id={optionId(index)} role="option" aria-selected={index === active}
        aria-disabled={!item.active} className={styles.result} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}>
        <span className={styles.resultText}>
          <span className={styles.name}>{item.name}</span>
          <span className={styles.mono}>Documento {item.identityDocument}{!item.active && ' · inactivo, no puede usarse en una venta nueva'}</span>
        </span>
      </li>)}
    </ul>
    <div role="status" aria-live="polite">
      {tooShort && <p className={styles.note}>Escribe al menos {CUSTOMER_QUERY_MIN} caracteres para buscar.</p>}
      {loading && <p className={styles.note}>Buscando cliente…</p>}
      {searchable && answered && results.length === 0 && <p className={styles.note}>No se encontraron clientes con ese dato.</p>}
      {open && results.length > 0 && hasMore && <p className={styles.note}>Hay más coincidencias que las {CUSTOMER_SUGGESTION_LIMIT} mostradas: escribe más del nombre o el documento completo para afinar.</p>}
    </div>
    {failed && <div role="alert" className={styles.errorNote}>
      <p className={styles.errorNote}>No se pudo buscar el cliente. Inténtalo de nuevo.</p>
      <Button variant="secondary" size="small" onClick={() => run(query)}>Reintentar búsqueda</Button>
    </div>}
    <PortalLink href="/customers" className={styles.note}>Crear cliente nuevo (la venta en curso se conserva al volver)</PortalLink>
  </div>
}
