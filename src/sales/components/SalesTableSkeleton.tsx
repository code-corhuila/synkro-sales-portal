import { SalesTableRegion } from './SalesTable'
import styles from './Skeleton.module.css'

export function SalesTableSkeleton() {
  return <>
    <p role="status">Cargando ventas…</p>
    <SalesTableRegion loading>
      {Array.from({ length: 5 }, (_, row) => <tr key={row} aria-hidden="true">
        {Array.from({ length: 5 }, (_, column) => <td key={column}><span className={`${styles.skeleton} ${styles.text}`} /></td>)}
      </tr>)}
    </SalesTableRegion>
  </>
}
