import { useSyncExternalStore } from 'react'
import { resolveScreen } from './routes'

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
  return resolveScreen(useSyncExternalStore(subscribe, currentPath))
}
