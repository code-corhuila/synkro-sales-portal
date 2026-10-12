import { saleDetailPath } from '../../navigation'
import { formatCents } from '../model/formatting'
import { STEP_LABELS, type SagaStep } from '../model/saga'
import type { RegistrationState, UnresolvedReason } from '../model/sagaMachine'
import type { SaleLookup } from '../pages/useRegisterSale'
import { Button } from './Button'
import { PortalLink } from './PortalLink'
import styles from './SagaStatus.module.css'

interface Props {
  state: RegistrationState
  sale: SaleLookup
  canRetry: boolean
  onRetry: () => void
  onResume: () => void
  onDismiss: () => void
}

// Safe Spanish copy per failed step. SagaResponse carries no reason text (ADR-007 hides
// error_detail), so nothing here is taken from the backend and no raw enum is shown.
const STEP_REASON: Record<SagaStep, [string, string]> = {
  'reserve-stock': ['No hay stock suficiente para uno o más productos de la venta.', 'Ajusta las cantidades e inténtalo de nuevo.'],
  'validate-customer': ['El cliente no está disponible para registrar ventas (por ejemplo, está inactivo o ya no existe).', 'Revisa el cliente e inténtalo de nuevo.'],
  'register-sale': ['La venta no pudo registrarse y los pasos previos fueron revertidos.', 'Inténtalo de nuevo; si se repite, contacta a un administrador.'],
}

const UNRESOLVED: Record<UnresolvedReason, string> = {
  timeout: 'La venta sigue en proceso y todavía no sabemos cómo terminó.',
  'status-unavailable': 'No se pudo consultar el estado de la venta y todavía no sabemos cómo terminó.',
  'invalid-response': 'El servicio dio una respuesta inesperada y todavía no sabemos cómo terminó la venta.',
}

export function SagaStatus({ state, sale, canRetry, onRetry, onResume, onDismiss }: Props) {
  return <>
    {/* Always mounted so assistive technology announces the changes inside it. */}
    <div role="status" aria-live="polite" aria-atomic="true" className={styles.live}>
      {state.phase === 'submitting' && <p className={styles.message}>Enviando la solicitud…</p>}
      {state.phase === 'running' && <>
        <p className={styles.message}>Procesando venta…</p>
        <p className={styles.detail}>Código de seguimiento: <span className={styles.mono}>{state.sagaId}</span></p>
      </>}
      {state.phase === 'completed' && <div className={styles.success}>
        <p className={styles.message}>Venta registrada</p>
        {sale.status === 'loading' && <p className={styles.detail}>Consultando el total registrado…</p>}
        {sale.status === 'ready' && <p className={styles.detail}>Total registrado: <span className={styles.mono}>{formatCents(sale.sale.totalCents)}</span></p>}
        {sale.status === 'error' && <p className={styles.detail}>No se pudo consultar el total. Revísalo en el historial.</p>}
        <div className={styles.actions}>
          <PortalLink href={saleDetailPath(state.saga.saleId)}>Ver detalle de la venta</PortalLink>
          <Button variant="ghost" size="small" onClick={onDismiss}>Cerrar aviso</Button>
        </div>
      </div>}
    </div>
    {state.phase === 'compensated' && <div role="alert" className={styles.alert}>
      <p className={styles.message}>No se pudo completar la venta</p>
      {state.saga.failedStep && <>
        <p className={styles.detail}>Paso fallido: {STEP_LABELS[state.saga.failedStep]}</p>
        <p className={styles.detail}>{STEP_REASON[state.saga.failedStep][0]}</p>
        <p className={styles.detail}>{STEP_REASON[state.saga.failedStep][1]}</p>
      </>}
      <div className={styles.actions}><Button variant="ghost" size="small" onClick={onDismiss}>Cerrar aviso</Button></div>
    </div>}
    {state.phase === 'failed' && <div role="alert" className={styles.alert}>
      <p className={styles.message}>La venta requiere atención</p>
      <p className={styles.detail}>No se pudo confirmar la reversión de la operación. No reenvíes esta venta como nueva: un responsable debe revisar el caso.</p>
      {state.saga.failedStep && <p className={styles.detail}>Paso con falla: {STEP_LABELS[state.saga.failedStep]}</p>}
      <p className={styles.detail}>Código de seguimiento: <span className={styles.mono}>{state.saga.sagaId}</span></p>
      <div className={styles.actions}><Button variant="secondary" size="small" onClick={onDismiss}>Entendido</Button></div>
    </div>}
    {state.phase === 'unresolved' && <div role="alert" className={styles.alert}>
      <p className={styles.message}>Venta sin resolver</p>
      <p className={styles.detail}>{UNRESOLVED[state.reason]}</p>
      <p className={styles.detail}>No envíes la venta de nuevo: podría duplicarse. Consulta el estado con este código: <span className={styles.mono}>{state.sagaId}</span></p>
      <div className={styles.actions}><Button variant="secondary" onClick={onResume}>Consultar estado</Button></div>
    </div>}
    {state.phase === 'submit-failed' && <div role="alert" className={styles.alert}>
      {state.kind === 'uncertain' && <>
        <p className={styles.message}>No se pudo confirmar si la venta fue recibida.</p>
        <p className={styles.detail}>Puedes reintentar: se enviará la misma solicitud sin duplicar la venta.</p>
      </>}
      {state.kind === 'rejected' && <p className={styles.message}>No se pudo registrar la venta. Revisa los datos e inténtalo de nuevo.</p>}
      {state.kind === 'forbidden' && <p className={styles.message}>No tienes permiso para registrar ventas.</p>}
      {state.kind === 'session' && <p className={styles.message}>La sesión ha finalizado. Vuelve a iniciar sesión desde SynkroTech.</p>}
      {state.traceId && <p className={styles.detail}>Referencia: {state.traceId}</p>}
      {state.kind === 'uncertain' && <div className={styles.actions}><Button variant="secondary" onClick={onRetry} disabled={!canRetry}>Reintentar envío</Button></div>}
    </div>}
  </>
}
