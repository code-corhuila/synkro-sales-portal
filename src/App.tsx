import { useState, useSyncExternalStore } from 'react'
import { parseRoute } from './routes'
import { SaleDetailPage } from './sales/pages/SaleDetailPage'
import { SalesPage } from './sales/pages/SalesPage'

// The host owns routing, guards and navigation; the remote never installs a competing browser
// router. But /sales and /sales/{id} are one host route (`/sales/*`), so moving between them keeps
// the same host element and the host does not render this component again (seen in the real host).
// The remote therefore follows the browser location itself: `navigateTo` and the browser's
// Back/Forward both announce a change with popstate, which is also what the host's router listens to.
const subscribe = (notify: () => void) => {
  window.addEventListener('popstate', notify)
  return () => window.removeEventListener('popstate', notify)
}
const currentPath = () => window.location.pathname

export default function App() {
  const route = parseRoute(useSyncExternalStore(subscribe, currentPath))
  const onHistory = route?.screen === 'history'
  // Once opened, the history screen stays mounted (hidden) while a detail is shown, so going
  // back keeps the person's form draft, filters and page instead of starting over.
  const [opened, setOpened] = useState(onHistory)
  if (onHistory && !opened) setOpened(true)
  if (!route) return null
  return <>
    {(opened || onHistory) && <div hidden={!onHistory}><SalesPage active={onHistory} /></div>}
    {route.screen === 'detail' && <SaleDetailPage key={route.saleId} saleId={route.saleId} />}
  </>
}
