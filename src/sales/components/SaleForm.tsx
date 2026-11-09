import { useCallback, useEffect, useRef, useState } from 'react'
import { getCustomer } from '../api/customersApi'
import { getProduct } from '../api/productsApi'
import { addProduct, decrementLine, removeLine, setLineQuantity } from '../model/cart'
import { formatCents } from '../model/formatting'
import type { CustomerChoice } from '../model/customer'
import { draftOwner, readDraft, removeDraft, writeDraft } from '../model/draftJournal'
import { restoreDraft } from '../model/draftRestore'
import type { Product } from '../model/product'
import {
  buildRegisterRequest, estimateTotal, parseQuantity, validateSaleForm,
  type FormErrors, type LineDraft, type RegisterSaleRequest, type SaleDraft,
} from '../model/saleForm'
import { Button } from './Button'
import catalogue from './Catalogue.module.css'
import { CustomerPicker } from './CustomerPicker'
import { ProductCatalogue } from './ProductCatalogue'
import { SaleCart } from './SaleCart'
import { SentAttempt } from './SentAttempt'
import styles from './SaleForm.module.css'

interface Props {
  pending: boolean
  // Set while an unchanged request must not be sent again (a saga that needs a person's attention).
  blockedReason?: string
  // An attempt that was sent and is not settled: shown read-only, never editable as a new sale.
  attempt?: RegisterSaleRequest | null
  // Raised when the person asks to choose another customer after the service refused the one used.
  customerResetSignal?: number
  onSubmit: (request: RegisterSaleRequest) => void
  onClear: () => void
  onDraftChange?: (request: RegisterSaleRequest | null) => void
}

const emptyDraft = (): SaleDraft => ({ customer: null, lines: [] })

const quantityOf = (lines: LineDraft[], productId: string) => lines.find((line) => line.product?.productId === productId)?.quantity ?? '0'

// What survives leaving the screen: identifiers and whole quantities only.
function toRecord({ customer, lines }: SaleDraft) {
  return {
    customerId: customer?.customerId ?? null,
    lines: lines.flatMap((line) => {
      const quantity = parseQuantity(line.quantity)
      return line.product && quantity !== null ? [{ productId: line.product.productId, quantity }] : []
    }),
  }
}

type Recovery = 'idle' | 'loading' | 'error'

export function SaleForm({ pending, blockedReason, attempt = null, customerResetSignal = 0, onSubmit, onClear, onDraftChange }: Props) {
  const [owner] = useState(draftOwner)
  const [draft, setDraft] = useState<SaleDraft>(emptyDraft)
  const draftRef = useRef(draft)
  const [generation, setGeneration] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const [customerFocus, setCustomerFocus] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const [notices, setNotices] = useState<string[]>([])
  // A stored sale is being rebuilt from the services (or could not be): nothing is saved or sent meanwhile.
  const [recovery, setRecovery] = useState<Recovery>(() => (!attempt && readDraft(owner) ? 'loading' : 'idle'))
  const form = useRef<HTMLFormElement>(null)
  const filter = useRef<HTMLInputElement>(null)
  const customerInput = useRef<HTMLInputElement>(null)
  const notify = useRef(onDraftChange)
  const dropCustomer = useRef(false)
  useEffect(() => { notify.current = onDraftChange })

  // Every change goes through here: memory first, then the recovery record (identifiers only).
  const apply = useCallback((next: SaleDraft) => {
    draftRef.current = next
    setDraft(next)
    writeDraft(owner, toRecord(next))
  }, [owner])

  // Rebuilds the stored sale from the services whenever the state says "loading": on arrival, after
  // "Reintentar recuperación", and when a sent attempt is settled and the sale becomes editable.
  useEffect(() => {
    if (recovery !== 'loading') return
    const controller = new AbortController()
    const record = readDraft(owner)
    const outcome = record
      ? restoreDraft(record, {
        loadCustomer: (customerId, signal) => getCustomer(customerId, { signal }),
        loadProduct: (productId, signal) => getProduct(productId, { signal }),
      }, controller.signal)
      : Promise.resolve(null)
    outcome.then(
      (restored) => {
        if (controller.signal.aborted) return
        // The record was discarded meanwhile (a confirmed sale, a clear): do not bring it back.
        if (restored && readDraft(owner)) {
          const customer = dropCustomer.current ? null : restored.customer
          apply({ customer, lines: restored.lines })
          setNotices(restored.notices)
        }
        dropCustomer.current = false
        setRecovery('idle')
      },
      () => { if (!controller.signal.aborted) setRecovery('error') },
    )
    return () => controller.abort()
  }, [recovery, owner, apply])

  const locked = Boolean(attempt)
  const [wasLocked, setWasLocked] = useState(locked)
  if (wasLocked !== locked) {
    setWasLocked(locked)
    // A settled attempt is no longer a sale in flight: the draft is read back and revalidated.
    if (!locked) setRecovery('loading')
  }

  useEffect(() => { notify.current?.(attempt ?? buildRegisterRequest(draft)) }, [draft, attempt])
  useEffect(() => {
    if (focusRequest) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusRequest])
  useEffect(() => { if (customerFocus) customerInput.current?.focus() }, [customerFocus])

  const seenReset = useRef(customerResetSignal)
  useEffect(() => {
    if (customerResetSignal === seenReset.current) return
    seenReset.current = customerResetSignal
    dropCustomer.current = true
    apply({ ...draftRef.current, customer: null })
    setNotices([])
    setAnnouncement('Elige otro cliente para esta venta.')
    setCustomerFocus((value) => value + 1)
  }, [customerResetSignal, apply])

  const result: FormErrors = validateSaleForm(draft)
  const visible = showErrors ? result : null
  const total = estimateTotal(draft)

  function changeLines(next: { lines: LineDraft[]; notice?: string }, confirmation?: (lines: LineDraft[]) => string) {
    apply({ ...draftRef.current, lines: next.lines })
    setAnnouncement(next.notice ?? confirmation?.(next.lines) ?? '')
  }
  function add(product: Product) {
    changeLines(addProduct(draftRef.current.lines, product), (lines) => `${product.name} agregado. En la venta: ${quantityOf(lines, product.productId)}.`)
  }
  function selectCustomer(customer: CustomerChoice | null) {
    apply({ ...draftRef.current, customer })
    // Next step of the flow is choosing products.
    if (customer) queueMicrotask(() => filter.current?.focus())
  }
  function submit() {
    if (attempt) { onSubmit(attempt); return }
    setShowErrors(true)
    const request = buildRegisterRequest(draft)
    if (!request) { setFocusRequest((value) => value + 1); return }
    onSubmit(request)
  }
  function clear() {
    apply(emptyDraft())
    setShowErrors(false)
    setAnnouncement('')
    setNotices([])
    setGeneration((value) => value + 1)
    onClear()
  }
  function discardUnrecovered() {
    removeDraft()
    setRecovery('idle')
  }
  const recovering = recovery !== 'idle'
  const busy = pending || recovering

  return <form ref={form} aria-label="Formulario de nueva venta" noValidate className={styles.form}
    onSubmit={(event) => { event.preventDefault(); if (!pending && !blockedReason && !recovering) submit() }}>
    {recovery === 'loading' && <p role="status" className={styles.note}>Recuperando tu venta en curso…</p>}
    {recovery === 'error' && <div role="alert" className={styles.errorNote}>
      <p className={styles.errorNote}>No se pudo recuperar la venta en curso. Tus productos y cantidades siguen guardados en este navegador.</p>
      <div className={styles.actions}>
        <Button variant="secondary" size="small" onClick={() => setRecovery('loading')}>Reintentar recuperación</Button>
        <Button variant="ghost" size="small" onClick={discardUnrecovered}>Descartar borrador</Button>
      </div>
    </div>}
    <div role="status" aria-label="Avisos de la venta recuperada" className={styles.notices}>
      {notices.map((notice) => <p key={notice} className={styles.note}>{notice}</p>)}
      {notices.length > 0 && <Button variant="ghost" size="small" onClick={() => setNotices([])}>Entendido</Button>}
    </div>
    {locked
      ? <SentAttempt request={attempt!} knownCustomer={draft.customer} knownProducts={draft.lines.flatMap((line) => (line.product ? [line.product] : []))} />
      : <fieldset className={styles.fieldset} disabled={busy}>
        <CustomerPicker key={`customer-${generation}`} customer={draft.customer} error={visible?.customer} onSelect={selectCustomer} inputRef={customerInput} />
        <div className={catalogue.layout}>
          <ProductCatalogue key={`catalogue-${generation}`} disabled={busy} onAdd={add} filterRef={filter} announcement={announcement} />
          <SaleCart lines={draft.lines} errors={visible?.lines} disabled={busy}
            onIncrement={(line) => { if (line.product) changeLines(addProduct(draftRef.current.lines, line.product)) }}
            onDecrement={(id) => changeLines({ lines: decrementLine(draftRef.current.lines, id) })}
            onQuantity={(id, text) => changeLines(setLineQuantity(draftRef.current.lines, id, text))}
            onRemove={(id) => changeLines({ lines: removeLine(draftRef.current.lines, id) })} />
        </div>
        {visible?.form && <p className={styles.errorNote}>{visible.form}</p>}
      </fieldset>}
    <div className={styles.footer}>
      {!locked && <p className={styles.total}>
        <span className={styles.totalLabel}>Total estimado (referencial)</span>
        <span className={styles.totalValue}>{total === null ? '—' : formatCents(total)}</span>
        <span className={styles.note}>No es el total de la venta: el sistema calcula el total oficial al registrarla.</span>
      </p>}
      <div className={styles.actions}>
        {!locked && <Button variant="secondary" onClick={clear} disabled={pending || recovering}>Limpiar</Button>}
        <Button type="submit" disabled={pending || recovering || locked || Boolean(blockedReason)} aria-busy={pending}>
          {pending ? <><span className={styles.spinner} aria-hidden="true" />Registrando venta…</> : 'Registrar venta'}
        </Button>
      </div>
    </div>
    {blockedReason && <p className={styles.note}>{blockedReason}</p>}
  </form>
}
