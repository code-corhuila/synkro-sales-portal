import { SalesTableRegion } from './SalesTable'
import styles from './Skeleton.module.css'
import table from './SalesTable.module.css'

export function SalesTableSkeleton() {
  return <>
    <p role="status">Cargando ventas…</p>
    <SalesTableRegion loading>
      {Array.from({ length: 5 }, (_, row) => <tr key={row} aria-hidden="true">
        {Array.from({ length: 6 }, (_, column) => <td key={column} className={column === 5 ? table.actionsCell : column === 2 ? undefined : table.numeric}>
          <span aria-hidden="true" className={`${styles.skeleton} ${styles.text}`} />
        </td>)}
      </tr>)}
    </SalesTableRegion>
  </>
}
