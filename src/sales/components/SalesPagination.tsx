import type { Page } from '../model/page'
import { Button } from './Button'
import styles from './SalesPagination.module.css'

export function SalesPagination({ meta, onPage }: { meta: Page<unknown>['meta']; onPage: (page: number) => void }) {
  if (meta.totalPages === 0) return null
  return <nav aria-label="Paginación del historial" className={styles.pagination}>
    <span className={styles.position}>Página {meta.page} de {meta.totalPages} · {meta.total} ventas · {meta.limit} por página</span>
    <Button variant="secondary" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Anterior</Button>
    <Button variant="secondary" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>Siguiente</Button>
  </nav>
}
