import { useId, useState } from 'react'
import { searchProducts } from '../api/productsApi'
import { formatCents } from '../model/formatting'
import { lineSubtotal, type LineDraft, type LineErrors } from '../model/saleForm'
import type { Product } from '../model/product'
import { Button } from './Button'
import field from './Field.module.css'
import styles from './SaleForm.module.css'
import { useSearch } from './useSearch'

interface Props {
  number: number
  line: LineDraft
  errors?: LineErrors
  canRemove: boolean
  onChange: (line: LineDraft) => void
  onRemove: () => void
}

export function SaleLineRow({ number, line, errors, canRemove, onChange, onRemove }: Props) {
  const id = useId()
  const [term, setTerm] = useState('')
  const [local, setLocal] = useState<string>()
  const { state, search } = useSearch((value, signal) => searchProducts(value, { signal }))
  const results = state.status === 'ready' ? state.value : []
  // The chosen product stays selectable even after a newer search no longer lists it.
  const chosen = line.product
  const options: Product[] = chosen && !results.some((item) => item.productId === chosen.productId) ? [chosen, ...results] : results
  const subtotal = lineSubtotal(line)
  const productError = errors?.product
  const searchProblem = local ?? (!chosen ? productError : undefined)
  const run = () => {
    if (!term.trim()) { setLocal('Escribe parte del nombre del producto.'); return }
    setLocal(undefined)
    search(term)
  }
  return <fieldset className={styles.line} aria-label={`Línea ${number}`}>
    <legend className={styles.lineLegend}>Línea {number}</legend>
    <div className={field.field}>
      <div className={styles.productSearch}>
        <div className={field.field}>
          <label className={field.label} htmlFor={`${id}-term`}>Buscar producto</label>
          <input id={`${id}-term`} value={term} autoComplete="off" aria-invalid={Boolean(searchProblem)}
            aria-describedby={`${id}-term-hint`}
            onChange={(event) => { setLocal(undefined); setTerm(event.target.value) }}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); run() } }} />
        </div>
        <Button variant="secondary" size="small" onClick={run} disabled={state.status === 'loading'}>Buscar producto</Button>
      </div>
      <p id={`${id}-term-hint`} className={searchProblem ? field.error : field.hint}>{searchProblem ?? 'Nombre completo o parcial.'}</p>
      {state.status === 'loading' && <p role="status" className={styles.note}>Buscando productos…</p>}
      {state.status === 'error' && <p role="alert" className={styles.errorNote}>No se pudo buscar productos. Inténtalo de nuevo.</p>}
      {state.status === 'ready' && !results.length && <p role="status" className={styles.note}>No hay productos activos con ese nombre.</p>}
    </div>
    {options.length > 0 && <div className={field.field}>
      <label className={field.label} htmlFor={`${id}-product`}>Producto</label>
      <select id={`${id}-product`} value={chosen?.productId ?? ''} aria-invalid={Boolean(productError && chosen)}
        aria-describedby={`${id}-product-hint`}
        onChange={(event) => onChange({ ...line, product: options.find((item) => item.productId === event.target.value) ?? null })}>
        <option value="">Selecciona un producto</option>
        {options.map((item) => <option key={item.productId} value={item.productId}>{item.name} · {formatCents(item.priceCents)} · stock {item.stock}</option>)}
      </select>
      <p id={`${id}-product-hint`} className={productError && chosen ? field.error : field.hint}>
        {chosen && productError ? productError : 'Precio de catálogo vigente, solo referencial.'}
      </p>
    </div>}
    <div className={field.field}>
      <label className={field.label} htmlFor={`${id}-quantity`}>Cantidad</label>
      <input id={`${id}-quantity`} inputMode="numeric" data-numeric value={line.quantity} autoComplete="off"
        aria-invalid={Boolean(errors?.quantity)} aria-describedby={`${id}-quantity-hint`}
        onChange={(event) => onChange({ ...line, quantity: event.target.value })} />
      <p id={`${id}-quantity-hint`} className={errors?.quantity ? field.error : field.hint}>{errors?.quantity ?? 'Unidades enteras.'}</p>
    </div>
    <div className={styles.subtotal}>
      <span className={styles.subtotalLabel}>Subtotal estimado</span>
      <span className={styles.numeric}>{subtotal === null ? '—' : formatCents(subtotal)}</span>
    </div>
    <div>
      <Button variant="ghost" size="small" onClick={onRemove} disabled={!canRemove} aria-label={`Quitar línea ${number}`}>Quitar</Button>
    </div>
  </fieldset>
}
