import type { ReportKind } from '../model/report'
import { ReportTableRegion } from './ReportTable'
import styles from './Skeleton.module.css'

export function ReportTableSkeleton({ kind }: { kind: ReportKind }) {
  return <>
    <p role="status">Cargando reporte…</p>
    <ReportTableRegion kind={kind} loading>
      {Array.from({ length: 5 }, (_, row) => <tr key={row} aria-hidden="true">
        {Array.from({ length: 3 }, (_, column) => <td key={column}><span aria-hidden="true" className={`${styles.skeleton} ${styles.text}`} /></td>)}
      </tr>)}
    </ReportTableRegion>
  </>
}
