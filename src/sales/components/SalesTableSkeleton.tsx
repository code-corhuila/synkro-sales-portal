import { SalesTableRegion } from './SalesTable'
import styles from './Skeleton.module.css'
import table from './SalesTable.module.css'

export function SalesTableSkeleton() {
  return <>
    <p role="status">Cargando ventas…</p>
    <SalesTableRegion loading>
      {Array.from({ length: 5 }, (_, row) => <tr key={row} aria-hidden="true">
        {Array.from({ length: 5 }, (_, column) => <td key={column} className={column === 4 ? table.actionsCell : column === 1 ? undefined : table.numeric}>
          <span aria-hidden="true" className={`${styles.skeleton} ${styles.text}`} />
        </td>)}
      </tr>)}
    </SalesTableRegion>
  </>
}
