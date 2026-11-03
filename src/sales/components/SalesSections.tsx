import { REPORT_KINDS, REPORT_TEXT, type ReportKind } from '../model/report'
import { SALES_PATH, reportPath } from '../../navigation'
import { PortalLink } from './PortalLink'
import styles from './ReportViews.module.css'

export type SalesSection = 'history' | ReportKind

// Moves between the history and the three reports. Real links (history API, no document load),
// so the host's in-memory session survives and a middle click still opens a new tab.
export function SalesSections({ current }: { current: SalesSection }) {
  const items = [{ key: 'history' as const, label: 'Historial', href: SALES_PATH }, ...REPORT_KINDS.map((kind) => ({ key: kind, label: REPORT_TEXT[kind].nav, href: reportPath(kind) }))]
  return <nav aria-label="Secciones de Ventas">
    <ul className={styles.sections}>
      {items.map((item) => <li key={item.key}>
        <PortalLink href={item.href} className={styles.section} aria-current={item.key === current ? 'page' : undefined}>{item.label}</PortalLink>
      </li>)}
    </ul>
  </nav>
}
