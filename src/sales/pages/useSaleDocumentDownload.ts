import { useCallback, useEffect, useRef, useState } from 'react'
import { prepareSaleDocument } from '../document/prepareSaleDocument'
import { renderSaleDocument } from '../document/renderSaleDocument'
import { SaleDocumentError, type SaleDocumentKind } from '../document/types'
import { downloadBlob } from '../export/downloadBlob'

export type DownloadState =
  | { status: 'idle' }
  | { status: 'preparing'; kind: SaleDocumentKind }
  | { status: 'done'; kind: SaleDocumentKind }
  | { status: 'error'; kind: SaleDocumentKind; error: SaleDocumentError }

const IDLE: DownloadState = { status: 'idle' }

// One download at a time per sale detail. Everything that outlives a click is tied to the sale on screen:
// changing sale or leaving the page aborts the reads, and a late answer can neither start a download nor
// change what the person sees. The Object URL is created and revoked inside downloadBlob.
export function useSaleDocumentDownload(saleId: string) {
  const [answer, setAnswer] = useState<{ saleId: string; state: DownloadState }>({ saleId, state: IDLE })
  const active = useRef<AbortController | null>(null)

  useEffect(() => () => {
    active.current?.abort()
    active.current = null
  }, [saleId])

  const download = useCallback(async (kind: SaleDocumentKind) => {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    const publish = (state: DownloadState) => { if (!controller.signal.aborted) setAnswer({ saleId, state }) }
    publish({ status: 'preparing', kind })
    try {
      const document = await prepareSaleDocument(saleId, { signal: controller.signal })
      if (controller.signal.aborted) return
      const file = await renderSaleDocument(kind, document)
      if (controller.signal.aborted) return
      downloadBlob(file.blob, file.fileName)
      publish({ status: 'done', kind })
    } catch (error) {
      if (controller.signal.aborted) return
      publish({ status: 'error', kind, error: error instanceof SaleDocumentError ? error : new SaleDocumentError('GENERATION_FAILED', 'No se pudo generar el archivo.') })
    } finally {
      if (active.current === controller) active.current = null
    }
  }, [saleId])

  // A state that belongs to another sale is never shown.
  const state = answer.saleId === saleId ? answer.state : IDLE
  return { state, busy: state.status === 'preparing', download }
}
