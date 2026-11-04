const REACT_RANGE = '^19.2.8'

export function createFederationConfig(shellEntryUrl = 'http://localhost:5173/assets/remoteEntry.js') {
  return {
    name: 'salesPortal',
    filename: 'remoteEntry.js',
    // The dashboard summary is a module of its own: the Host mounts it on /dashboard.
    exposes: { './App': './src/App.tsx', './DashboardSummary': './src/sales/pages/DashboardSummary.tsx' },
    remotes: { shell: shellEntryUrl },
    shared: {
      react: { requiredVersion: REACT_RANGE },
      'react-dom': { requiredVersion: REACT_RANGE },
    },
  }
}

export const federationConfig = createFederationConfig()
