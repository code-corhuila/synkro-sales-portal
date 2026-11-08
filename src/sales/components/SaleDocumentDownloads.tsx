import { useId } from 'react'
import { session } from 'shell/session'
import type { SaleDocumentError, SaleDocumentKind } from '../document/types'
import { useSaleDocumentDownload } from '../pages/useSaleDocumentDownload'
import { Button } from './Button'
import styles from './SaleDocumentDownloads.module.css'

const LABEL: Record<SaleDocumentKind, string> = { pdf: 'PDF', xml: 'XML' }

// Spanish copy per failure. The server's own message is never shown; only its trace reference.
function describe(error: SaleDocumentError): { message: string; retry: boolean } {
  switch (error.code) {
    case 'SESSION_EXPIRED': return { message: 'La sesión ha finalizado. Vuelve a iniciar sesión desde SynkroTech.', retry: false }
    case 'FORBIDDEN': return { message: 'No tienes permiso para descargar esta venta.', retry: false }
    case 'NOT_FOUND': return { message: 'La venta no existe o no está disponible para ti.', retry: false }
    case 'CUSTOMER_UNAVAILABLE': return { message: 'No se puede generar el documento: no se pudieron obtener los datos del cliente (puede estar inactivo). No se genera un archivo incompleto.', retry: false }
    case 'PRODUCT_UNAVAILABLE': return { message: 'No se puede generar el documento: no se pudo obtener la información de uno o más productos de la venta con tu rol. No se genera un archivo incompleto.', retry: false }
    case 'ISSUER_CONFIG': return { message: `${error.message} Informa al administrador de la plataforma: no se genera el documento sin los datos reales del emisor.`, retry: false }
    case 'INVALID_SALE': return { message: 'No se puede generar el documento: la venta tiene datos inconsistentes.', retry: false }
    case 'GENERATION_FAILED': return { message: 'No se pudo generar el archivo. Inténtalo de nuevo.', retry: true }
    default: return { message: 'No se pudo preparar el documento. Inténtalo de nuevo.', retry: true }
  }
}

// Downloads of the sale document (HU-VEN-19). Hiding the buttons from other roles is a convenience:
// ADMIN/SALESPERSON scope and ownership are decided by the server on every read the document needs.
export function SaleDocumentDownloads({ saleId }: { saleId: string }) {
  const title = useId()
  const { state, busy, download } = useSaleDocumentDownload(saleId)
  const role = session.user()?.role
  if (role !== 'ADMIN' && role !== 'SALESPERSON') return null

  const failure = state.status === 'error' ? describe(state.error) : null
  const status = state.status === 'preparing' ? `Preparando ${LABEL[state.kind]}…` : state.status === 'done' ? `${LABEL[state.kind]} descargado.` : ''
  return <section className={styles.card} aria-labelledby={title}>
    <h2 id={title} className={styles.title}>Documento de la venta</h2>
    <p className={styles.note}>Comprobante de venta de alcance comercial. No es una factura electrónica ni un documento tributario validado.</p>
    <div className={styles.actions}>
      <Button variant="secondary" onClick={() => void download('pdf')} disabled={busy} aria-busy={state.status === 'preparing' && state.kind === 'pdf'}>Descargar PDF</Button>
      <Button variant="secondary" onClick={() => void download('xml')} disabled={busy} aria-busy={state.status === 'preparing' && state.kind === 'xml'}>Descargar XML</Button>
    </div>
    <p role="status" aria-live="polite" className={styles.status}>{status}</p>
    {state.status === 'error' && failure && <div role="alert" className={styles.alert}>
      <p className={styles.message}>{failure.message}</p>
      {state.error.traceId && <p className={styles.message}>Referencia: {state.error.traceId}</p>}
      {failure.retry && <Button variant="secondary" size="small" onClick={() => void download(state.kind)}>Reintentar</Button>}
    </div>}
  </section>
}
