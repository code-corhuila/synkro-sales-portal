import { useState } from 'react'
import { datePresetRange, type DatePresetId } from '../model/datePresets'
import type { SalesFilters } from '../model/filters'
import { Button } from './Button'
import styles from './DatePresets.module.css'

const PRESETS: readonly { id: DatePresetId; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: 'month', label: 'Este mes' },
]

interface Props {
  filters: SalesFilters
  onPreset: (range: SalesFilters) => void
  onCustom: () => void
}

// Each preset is the same inclusive UTC range the manual "Desde"/"Hasta" fields already accept
// (`datePresetRange`), so picking one goes through the exact same `onApply` path as typing dates
// by hand. "Personalizado" is not itself a range — it only moves focus to the manual fields, so
// no request is made just for selecting it.
export function DatePresets({ filters, onPreset, onCustom }: Props) {
  const [now, setNow] = useState(() => new Date())
  const activeId = PRESETS.find(({ id }) => {
    const range = datePresetRange(id, now)
    return filters.from === range.from && filters.to === range.to
  })?.id
  const custom = !activeId && Boolean(filters.from || filters.to)
  return (
    <div role="group" aria-label="Filtros rápidos" className={styles.presets}>
      {PRESETS.map(({ id, label }) => (
        <Button key={id} variant={activeId === id ? 'primary' : 'secondary'} size="small"
          aria-pressed={activeId === id} onClick={() => {
            const current = new Date()
            setNow(current)
            onPreset(datePresetRange(id, current))
          }}>{label}</Button>
      ))}
      <Button variant={custom ? 'primary' : 'secondary'} size="small" aria-pressed={custom} onClick={onCustom}>Personalizado</Button>
    </div>
  )
}
