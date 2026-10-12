import { resolveScreen } from './routes'

// The host owns routing, guards and navigation. It renders this component again
// on location changes; the remote never installs a competing browser router.
export default function App() {
  return resolveScreen(window.location.pathname)
}
