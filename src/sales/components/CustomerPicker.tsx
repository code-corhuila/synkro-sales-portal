import { useEffect, useId, useState, type Ref } from 'react'
import { searchCustomers } from '../api/customersApi'
import type { Customer } from '../model/customer'
import { Button } from './Button'
import field from './Field.module.css'
import styles from './SaleForm.module.css'
import { useSearch } from './useSearch'

export const CUSTOMER_SUGGESTION_LIMIT = 5
export const CUSTOMER_DEBOUNCE_MS = 200

interface Props {
  customer: Customer | null
  error?: string
  onSelect: (customer: Customer | null) => void
  // The lookup is injectable: the real one is the Customers search contract (see searchCustomers).
  search?: (term: string, signal: AbortSignal) => Promise<Customer[]>
  inputRef?: Ref<HTMLInputElement>
}

// One autocomplete: debounced, at most five suggestions, arrow keys, Enter and Escape. Enter on an
// exact document selects that customer directly. Inactive customers are listed so the person
// understands why they cannot be used, but they are never selectable.
export function CustomerPicker({ customer, error, onSelect, search = (term, signal) => searchCustomers(term, { signal }), inputRef }: Props) {
  const id = useId()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const lookup = useSearch<Customer[]>(search)
  const run = lookup.search

  useEffect(() => {
    const term = text.trim()
    if (!term || customer) return
    const timer = setTimeout(() => run(term), CUSTOMER_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text, customer, run])

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

  const term = text.trim()
  const results = lookup.state.status === 'ready' && term ? lookup.state.value.slice(0, CUSTOMER_SUGGESTION_LIMIT) : []
  const listId = `${id}-list`
  const optionId = (index: number) => `${id}-option-${index}`
  const showList = open && results.length > 0

  function choose(candidate: Customer | undefined) {
    if (!candidate || !candidate.active) return
    setOpen(false)
    setActive(-1)
    setText('')
    onSelect(candidate)
  }
  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!results.length) return
      event.preventDefault()
      setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => (current + step + results.length) % results.length)
    } else if (event.key === 'Escape') {
      if (open) { event.preventDefault(); setOpen(false); setActive(-1) }
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const highlighted = showList && active >= 0 ? results[active] : undefined
      choose(highlighted ?? results.find((item) => item.identityDocument === term))
    }
  }

  const status = lookup.state.status
  return <div className={styles.picker}>
    <div className={field.field}>
      <label className={field.label} htmlFor={`${id}-input`}>Cliente (documento)</label>
      <input id={`${id}-input`} ref={inputRef} role="combobox" aria-autocomplete="list" aria-expanded={showList} aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint`}
        value={text} autoComplete="off" maxLength={30}
        onChange={(event) => { setText(event.target.value); setOpen(true); setActive(-1) }} onKeyDown={onKeyDown} />
      <p id={`${id}-hint`} className={error ? field.error : field.hint}>
        {error ?? 'Escribe el documento del cliente. La búsqueda por nombre se habilita con la entrega de Clientes (HU-CLI-05).'}
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
    {status === 'loading' && <p role="status" className={styles.note}>Buscando cliente…</p>}
    {status === 'error' && <p role="alert" className={styles.errorNote}>No se pudo buscar el cliente. Inténtalo de nuevo.</p>}
    {status === 'ready' && term && results.length === 0 && <p role="status" className={styles.note}>No se encontraron clientes con ese dato.</p>}
    <a href="/customers" target="_blank" rel="noopener noreferrer" className={styles.note}>Crear cliente nuevo (se abre en otra pestaña y no pierde esta venta)</a>
  </div>
}
