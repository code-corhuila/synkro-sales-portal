// The host owns routing, guards and navigation. It renders this component again
// on location changes; the remote never installs a competing browser router.
export default function App() {
  return /^\/sales\/?$/.test(window.location.pathname) ? <h1>Ventas</h1> : null
}
