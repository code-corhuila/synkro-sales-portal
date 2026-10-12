import { Button } from './Button'
import styles from './SalesState.module.css'

export function SalesError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const shared = error as { status?: number; body?: { traceId?: string; error?: string } } | null
  const status = shared?.status
  const authentication = status === 401
  const authorization = status === 403
  const message = authentication ? 'La sesión ha finalizado. Vuelve a iniciar sesión desde SynkroTech.'
    : authorization ? 'No tienes permiso para consultar el historial de ventas.'
    : 'No se pudo cargar el historial de ventas.'
  return <div role="alert" className={styles.alert}>
    <p className={styles.message}>{message}</p>
    {status === 0 && <p className={styles.message}>No se pudo conectar con el servidor. Inténtalo de nuevo.</p>}
    {shared?.body?.traceId && <p className={styles.message}>Referencia: {shared.body.traceId}</p>}
    {!authentication && !authorization && <Button variant="secondary" onClick={onRetry}>Reintentar</Button>}
  </div>
}
