import { useId, type RefObject } from 'react'
import { validateFilters, type FilterErrors, type SalesFilters } from '../model/filters'
import { Button } from './Button'
import field from './Field.module.css'
import styles from './ReportViews.module.css'

interface Props {
  filters: SalesFilters
  errors: FilterErrors
  onChange: (filters: SalesFilters) => void
  onErrors: (errors: FilterErrors) => void
  onApply: (filters: SalesFilters) => void
  onClear: () => void
  // Lets a caller (the dashboard's "Personalizado" shortcut) send focus to the first manual
  // field. Optional: the full report screens do not pass it and behave exactly as before.
  fromRef?: RefObject<HTMLInputElement | null>
}

// Inclusive UTC days, both optional. A reversed range is explained here and never sent.
export function ReportFilterBar({ filters, errors, onChange, onErrors, onApply, onClear, fromRef }: Props) {
  const id = useId()
  const fields = [{ name: 'from', label: 'Desde' }, { name: 'to', label: 'Hasta' }] as const
  return (
    <form aria-label="Filtros del reporte" className={styles.filters} noValidate onSubmit={(event) => {
      event.preventDefault()
      const invalid = validateFilters(filters)
      onErrors(invalid)
      const first = fields.find(({ name }) => invalid[name])
      if (first) (event.currentTarget.elements.namedItem(first.name) as HTMLInputElement).focus()
      else onApply(filters)
    }}>
      {fields.map(({ name, label }) => (
        <div key={name} className={field.field}>
          <label className={field.label} htmlFor={`${id}-${name}`}>{label}</label>
          <input id={`${id}-${name}`} name={name} type="date" value={filters[name] ?? ''} ref={name === 'from' ? fromRef : undefined}
            aria-invalid={Boolean(errors[name])} aria-describedby={`${id}-${name}-hint`}
            onChange={(event) => { onErrors({}); onChange({ ...filters, [name]: event.target.value }) }} />
          <p id={`${id}-${name}-hint`} className={errors[name] ? field.error : field.hint}>{errors[name] ?? 'Día UTC inclusive; opcional.'}</p>
        </div>
      ))}
      <div className={styles.actions}>
        <Button type="submit">Aplicar filtros</Button>
        <Button variant="secondary" onClick={onClear}>Limpiar filtros</Button>
      </div>
    </form>
  )
}
