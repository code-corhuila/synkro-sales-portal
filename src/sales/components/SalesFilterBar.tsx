import { useId } from 'react'
import { validateFilters, type FilterErrors, type SalesFilters } from '../model/filters'
import { Button } from './Button'
import field from './Field.module.css'
import styles from './SalesFilterBar.module.css'

interface Props {
  filters: SalesFilters
  errors: FilterErrors
  onChange: (filters: SalesFilters) => void
  onErrors: (errors: FilterErrors) => void
  onApply: (filters: SalesFilters) => void
  onClear: () => void
}

export function SalesFilterBar({ filters, errors, onChange, onErrors, onApply, onClear }: Props) {
  const id = useId()
  const fields = [{ name: 'from', label: 'Desde', type: 'date' }, { name: 'to', label: 'Hasta', type: 'date' }, { name: 'customerId', label: 'ID del cliente', type: 'text' }] as const
  return (
    <form aria-label="Filtros del historial" className={styles.filters} noValidate onSubmit={(event) => {
      event.preventDefault()
      const invalid = validateFilters(filters)
      onErrors(invalid)
      const first = fields.find(({ name }) => invalid[name])
      if (first) (event.currentTarget.elements.namedItem(first.name) as HTMLInputElement).focus()
      else onApply(filters)
    }}>
      {fields.map(({ name, label, type }) => (
        <div key={name} className={field.field}>
          <label className={field.label} htmlFor={`${id}-${name}`}>{label}</label>
          <input id={`${id}-${name}`} name={name} type={type} value={filters[name] ?? ''}
            aria-invalid={Boolean(errors[name])} aria-describedby={`${id}-${name}-hint`}
            onChange={(event) => { onErrors({}); onChange({ ...filters, [name]: event.target.value }) }} />
          <p id={`${id}-${name}-hint`} className={errors[name] ? field.error : field.hint}>
            {errors[name] ?? (name === 'customerId' ? 'UUID completo del cliente; opcional.' : 'Día UTC inclusive; opcional.')}
          </p>
        </div>
      ))}
      <div className={styles.actions}>
        <Button type="submit">Aplicar filtros</Button>
        <Button variant="secondary" onClick={onClear}>Limpiar filtros</Button>
      </div>
    </form>
  )
}
