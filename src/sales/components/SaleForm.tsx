import { useEffect, useRef, useState } from 'react'
import { formatCents } from '../model/formatting'
import {
  MAX_LINES, buildRegisterRequest, estimateTotal, newLine, validateSaleForm,
  type FormErrors, type RegisterSaleRequest, type SaleDraft,
} from '../model/saleForm'
import { Button } from './Button'
import { CustomerPicker } from './CustomerPicker'
import { SaleLineRow } from './SaleLineRow'
import styles from './SaleForm.module.css'

interface Props {
  pending: boolean
  // Set while an unchanged request must not be sent again (a saga that needs a person's attention).
  blockedReason?: string
  onSubmit: (request: RegisterSaleRequest) => void
  onClear: () => void
  onDraftChange?: (request: RegisterSaleRequest | null) => void
}

const emptyDraft = (): SaleDraft => ({ customer: null, lines: [newLine()] })

export function SaleForm({ pending, blockedReason, onSubmit, onClear, onDraftChange }: Props) {
  const [draft, setDraft] = useState<SaleDraft>(emptyDraft)
  const [generation, setGeneration] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const form = useRef<HTMLFormElement>(null)
  const notify = useRef(onDraftChange)
  useEffect(() => { notify.current = onDraftChange })
  useEffect(() => { notify.current?.(buildRegisterRequest(draft)) }, [draft])
  useEffect(() => {
    if (focusRequest) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusRequest])

  const result: FormErrors = validateSaleForm(draft)
  const visible = showErrors ? result : null
  const total = estimateTotal(draft)
  const atLimit = draft.lines.length >= MAX_LINES

  function submit() {
    setShowErrors(true)
    const request = buildRegisterRequest(draft)
    if (!request) { setFocusRequest((value) => value + 1); return }
    onSubmit(request)
  }
  function clear() {
    setDraft(emptyDraft())
    setShowErrors(false)
    setGeneration((value) => value + 1)
    onClear()
  }

  return <form ref={form} aria-label="Formulario de nueva venta" noValidate className={styles.form}
    onSubmit={(event) => { event.preventDefault(); if (!pending && !blockedReason) submit() }}>
    <fieldset className={styles.fieldset} disabled={pending}>
      <CustomerPicker key={`customer-${generation}`} customer={draft.customer} error={visible?.customer}
        onSelect={(customer) => setDraft({ ...draft, customer })} />
      <ol className={styles.lines} aria-label="Líneas de la venta">
        {draft.lines.map((line, index) => <li key={`${generation}-${line.id}`}>
          <SaleLineRow number={index + 1} line={line} errors={visible?.lines[line.id]} canRemove={draft.lines.length > 1}
            onChange={(next) => setDraft({ ...draft, lines: draft.lines.map((item) => (item.id === line.id ? next : item)) })}
            onRemove={() => setDraft({ ...draft, lines: draft.lines.filter((item) => item.id !== line.id) })} />
        </li>)}
      </ol>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => setDraft({ ...draft, lines: [...draft.lines, newLine()] })} disabled={atLimit}>Agregar línea</Button>
      </div>
      {(atLimit || visible?.form) && <p className={visible?.form ? styles.errorNote : styles.note}>{visible?.form ?? 'Una venta admite hasta 100 líneas.'}</p>}
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
