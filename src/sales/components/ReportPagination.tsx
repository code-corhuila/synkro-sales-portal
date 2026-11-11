import type { Page } from '../model/page'
import { REPORT_TEXT, type ReportKind } from '../model/report'
import { countLabel } from '../model/reportFormatting'
import { Button } from './Button'
import styles from './ReportViews.module.css'

// `meta.total` counts groups (days, months, products), not sales, so the text names the group.
export function ReportPagination({ kind, meta, onPage, label = 'Paginación del reporte' }: {
  kind: ReportKind; meta: Page<unknown>['meta']; onPage: (page: number) => void; label?: string
}) {
  if (meta.totalPages === 0) return null
  const { singular, plural } = REPORT_TEXT[kind]
  return <nav aria-label={label} className={styles.pagination}>
    <span className={styles.position}>Página {meta.page} de {meta.totalPages} · {countLabel(meta.total, singular, plural)} · {meta.limit} por página</span>
    <Button variant="secondary" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Anterior</Button>
    <Button variant="secondary" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>Siguiente</Button>
  </nav>
}
