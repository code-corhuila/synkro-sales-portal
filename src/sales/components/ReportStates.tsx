import { Button } from './Button'
import styles from './SalesState.module.css'

type Failure = { status?: number; body?: { traceId?: string } } | null

// One wording for every report surface (screens and dashboard tiles). 401 and 403 are not
// retried: a retry cannot fix a finished session or a missing permission.
export function reportFailureMessage(error: unknown, whatFailed: string): { message: string; retryable: boolean; traceId?: string; offline: boolean } {
  const failure = error as Failure
  const status = failure?.status
  if (status === 401) return { message: 'La sesión ha finalizado. Vuelve a iniciar sesión desde SynkroTech.', retryable: false, offline: false }
  if (status === 403) return { message: 'No tienes permiso para consultar los reportes de ventas.', retryable: false, offline: false }
  return { message: whatFailed, retryable: true, traceId: failure?.body?.traceId, offline: status === 0 }
}

export function ReportError({ error, whatFailed = 'No se pudo cargar el reporte.', onRetry }: { error: unknown; whatFailed?: string; onRetry: () => void }) {
  const { message, retryable, traceId, offline } = reportFailureMessage(error, whatFailed)
  return <div role="alert" className={styles.alert}>
    <p className={styles.message}>{message}</p>
    {offline && <p className={styles.message}>No se pudo conectar con el servidor. Inténtalo de nuevo.</p>}
    {traceId && <p className={styles.message}>Referencia: {traceId}</p>}
    {retryable && <Button variant="secondary" onClick={onRetry}>Reintentar</Button>}
  </div>
}

export function ReportEmpty({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return <div className={styles.empty}>
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="10" y="6" width="28" height="36" rx="4" /><path d="M16 16h16M16 24h16M16 32h8" /></svg>
    <p className={styles.message}>{filtered ? 'Ningún resultado coincide con estos filtros.' : 'Todavía no hay ventas para este reporte.'}</p>
    {filtered && <Button variant="secondary" onClick={onClear} aria-label="Limpiar filtros del reporte">Limpiar filtros</Button>}
  </div>
}
