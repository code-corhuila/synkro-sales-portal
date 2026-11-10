import { useEffect, useRef, useState } from 'react'
import { addProduct, decrementLine, removeLine, setLineQuantity } from '../model/cart'
import { formatCents } from '../model/formatting'
import type { CustomerChoice } from '../model/customer'
import type { Product } from '../model/product'
import {
  buildRegisterRequest, estimateTotal, validateSaleForm,
  type FormErrors, type LineDraft, type RegisterSaleRequest, type SaleDraft,
} from '../model/saleForm'
import { Button } from './Button'
import catalogue from './Catalogue.module.css'
import { CustomerPicker } from './CustomerPicker'
import { ProductCatalogue } from './ProductCatalogue'
import { SaleCart } from './SaleCart'
import styles from './SaleForm.module.css'

interface Props {
  pending: boolean
  // Set while an unchanged request must not be sent again (a saga that needs a person's attention).
  blockedReason?: string
  onSubmit: (request: RegisterSaleRequest) => void
  onClear: () => void
  onDraftChange?: (request: RegisterSaleRequest | null) => void
}

const emptyDraft = (): SaleDraft => ({ customer: null, lines: [] })

const quantityOf = (lines: LineDraft[], productId: string) => lines.find((line) => line.product?.productId === productId)?.quantity ?? '0'

export function SaleForm({ pending, blockedReason, onSubmit, onClear, onDraftChange }: Props) {
  const [draft, setDraft] = useState<SaleDraft>(emptyDraft)
  const [generation, setGeneration] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const form = useRef<HTMLFormElement>(null)
  const filter = useRef<HTMLInputElement>(null)
  const notify = useRef(onDraftChange)
  useEffect(() => { notify.current = onDraftChange })
  useEffect(() => { notify.current?.(buildRegisterRequest(draft)) }, [draft])
  useEffect(() => {
    if (focusRequest) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusRequest])

  const result: FormErrors = validateSaleForm(draft)
  const visible = showErrors ? result : null
  const total = estimateTotal(draft)

  function changeLines(next: { lines: LineDraft[]; notice?: string }, confirmation?: (lines: LineDraft[]) => string) {
    setDraft((current) => ({ ...current, lines: next.lines }))
    setAnnouncement(next.notice ?? confirmation?.(next.lines) ?? '')
  }
  function add(product: Product) {
    changeLines(addProduct(draft.lines, product), (lines) => `${product.name} agregado. En la venta: ${quantityOf(lines, product.productId)}.`)
  }
  function selectCustomer(customer: CustomerChoice | null) {
    setDraft((current) => ({ ...current, customer }))
    // Next step of the flow is choosing products.
    if (customer) queueMicrotask(() => filter.current?.focus())
  }
  function submit() {
    setShowErrors(true)
    const request = buildRegisterRequest(draft)
    if (!request) { setFocusRequest((value) => value + 1); return }
    onSubmit(request)
  }
  function clear() {
    setDraft(emptyDraft())
    setShowErrors(false)
    setAnnouncement('')
    setGeneration((value) => value + 1)
    onClear()
  }
  const busy = pending

  return <form ref={form} aria-label="Formulario de nueva venta" noValidate className={styles.form}
    onSubmit={(event) => { event.preventDefault(); if (!pending && !blockedReason) submit() }}>
    <fieldset className={styles.fieldset} disabled={busy}>
      <CustomerPicker key={`customer-${generation}`} customer={draft.customer} error={visible?.customer} onSelect={selectCustomer} />
      <div className={catalogue.layout}>
        <ProductCatalogue key={`catalogue-${generation}`} disabled={busy} onAdd={add} filterRef={filter} announcement={announcement} />
        <SaleCart lines={draft.lines} errors={visible?.lines} disabled={busy}
          onIncrement={(line) => { if (line.product) changeLines(addProduct(draft.lines, line.product)) }}
          onDecrement={(id) => changeLines({ lines: decrementLine(draft.lines, id) })}
          onQuantity={(id, text) => changeLines(setLineQuantity(draft.lines, id, text))}
          onRemove={(id) => changeLines({ lines: removeLine(draft.lines, id) })} />
      </div>
      {visible?.form && <p className={styles.errorNote}>{visible.form}</p>}
    </fieldset>
    <div className={styles.footer}>
      <p className={styles.total}>
        <span className={styles.totalLabel}>Total estimado (referencial)</span>
        <span className={styles.totalValue}>{total === null ? '—' : formatCents(total)}</span>
        <span className={styles.note}>No es el total de la venta: el sistema calcula el total oficial al registrarla.</span>
      </p>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={clear} disabled={pending}>Limpiar</Button>
        <Button type="submit" disabled={pending || Boolean(blockedReason)} aria-busy={pending}>
          {pending ? <><span className={styles.spinner} aria-hidden="true" />Registrando venta…</> : 'Registrar venta'}
        </Button>
      </div>
    </div>
    {blockedReason && <p className={styles.note}>{blockedReason}</p>}
  </form>
}
