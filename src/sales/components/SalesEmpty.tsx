import { Button } from './Button'
import styles from './SalesState.module.css'

export function SalesEmpty({ filtered, onClear, onReload }: { filtered: boolean; onClear: () => void; onReload: () => void }) {
  return <div className={styles.empty}>
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="10" y="6" width="28" height="36" rx="4" /><path d="M16 16h16M16 24h16M16 32h8" /></svg>
    <p className={styles.message}>{filtered ? 'Ninguna venta coincide con estos filtros.' : 'No hay ventas registradas todavía.'}</p>
    <Button variant="secondary" onClick={filtered ? onClear : onReload} aria-label={filtered ? 'Limpiar filtros del historial' : undefined}>
      {filtered ? 'Limpiar filtros' : 'Recargar historial'}
    </Button>
  </div>
}
