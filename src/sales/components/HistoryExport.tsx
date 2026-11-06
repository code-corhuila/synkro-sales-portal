import { useEffect, useRef, useState } from 'react'
import { listAllMatchingSales } from '../api/exportSales'
import { downloadBlob } from '../export/downloadBlob'
import { buildSalesWorkbook } from '../export/workbook'
import type { SalesFilters } from '../model/filters'
import { Button } from './Button'

export function HistoryExport({ filters }: { filters: SalesFilters }) {
  const request = useRef<AbortController | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  useEffect(() => () => request.current?.abort(), [])

  async function save() {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setStatus('')
    setError('')
    try {
      const rows = await listAllMatchingSales(filters, controller.signal)
      if (controller.signal.aborted) return
      const file = await buildSalesWorkbook(rows)
      if (controller.signal.aborted) return
      downloadBlob(file, 'historial-ventas.xlsx')
      setStatus('Historial descargado.')
    } catch (failure) {
      if (controller.signal.aborted) return
      const code = (failure as { status?: number } | undefined)?.status
      if (code === 401) setError('La sesión ha finalizado. Vuelve a iniciar sesión.')
      else if (code === 403) setError('No tienes permiso para exportar estas ventas.')
      else if (failure instanceof Error && /^(Aplica más filtros|Las ventas cambiaron|El importe supera)/.test(failure.message)) setError(failure.message)
      else setError('No se pudo generar el archivo. Inténtalo de nuevo.')
    } finally {
      request.current = null
      if (!controller.signal.aborted) setPending(false)
    }
  }

  return <div>
    <Button variant="secondary" onClick={() => void save()} disabled={pending} aria-busy={pending}>
      Descargar Excel
    </Button>
    <p aria-live="polite">{pending ? 'Generando archivo…' : status}</p>
    {error && <p role="alert">{error}</p>}
  </div>
}
