import { useId } from 'react'
import { formatCents } from '../model/formatting'
import { lineSubtotal, type LineDraft, type LineErrors } from '../model/saleForm'
import { Button } from './Button'
import styles from './Catalogue.module.css'

interface Props {
  lines: LineDraft[]
  errors: Record<string, LineErrors> | undefined
  disabled?: boolean
  onIncrement: (line: LineDraft) => void
  onDecrement: (id: string) => void
  onQuantity: (id: string, text: string) => void
  onRemove: (id: string) => void
}

export function SaleCart({ lines, errors, disabled, onIncrement, onDecrement, onQuantity, onRemove }: Props) {
  const id = useId()
  return <section aria-labelledby={`${id}-title`} className={styles.cart}>
    <h3 id={`${id}-title`} className={styles.heading}>Venta actual</h3>
    {lines.length === 0 && <p className={styles.empty}>Aún no hay productos. Haz clic en uno del catálogo para agregarlo.</p>}
    {lines.length > 0 && <ul className={styles.items} aria-label="Productos de la venta">
      {lines.map((line) => {
        const name = line.product?.name ?? 'Producto'
        const subtotal = lineSubtotal(line)
        const lineErrors = errors?.[line.id]
        return <li key={line.id} className={styles.item}>
          <span className={styles.itemName}>{name}</span>
          <span className={styles.subtotal} aria-label={`Subtotal de ${name}`}>{subtotal === null ? '—' : formatCents(subtotal)}</span>
          <span className={styles.price}>{line.product ? `${formatCents(line.product.priceCents)} c/u` : ''}</span>
          <span className={styles.qty}>
            <Button variant="secondary" size="small" disabled={disabled} aria-label={`Quitar una unidad de ${name}`} onClick={() => onDecrement(line.id)}>−</Button>
            <input className={styles.qtyInput} inputMode="numeric" autoComplete="off" disabled={disabled} aria-label={`Cantidad de ${name}`}
              aria-invalid={Boolean(lineErrors?.quantity)} value={line.quantity} onChange={(event) => onQuantity(line.id, event.target.value)} />
            <Button variant="secondary" size="small" disabled={disabled} aria-label={`Agregar una unidad de ${name}`} onClick={() => onIncrement(line)}>+</Button>
            <Button variant="ghost" size="small" disabled={disabled} aria-label={`Quitar ${name} de la venta`} onClick={() => onRemove(line.id)}>Quitar</Button>
          </span>
          {lineErrors?.quantity && <p role="alert" className={styles.itemError}>{lineErrors.quantity}</p>}
          {lineErrors?.product && <p role="alert" className={styles.itemError}>{lineErrors.product}</p>}
        </li>
      })}
    </ul>}
  </section>
}
