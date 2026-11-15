# History behavior

Detailed procedures and delivery notes moved from the repository README at
[source 1d696bd](https://github.com/code-corhuila/synkro-sales-portal/blob/1d696bdb97ebac08663153eb6712954d29774516/README.md).
Recorded execution results retain their original scope; moving them does not
constitute a new execution or certify a different revision.

Run commands from the repository root unless a step explicitly changes directory.

## Sales history

React remote originally delivered for [story #241](https://github.com/code-corhuila/synkro-docs/issues/241), using Node 22, React 19, strict TypeScript, Vite and @originjs/vite-plugin-federation. The recorded lockfile selection resolves React/React DOM 19.3.0, matching the corresponding Products/Host locks; manifests declare ^19.2.8.

```sh
npm ci
npm run lint
npm run build
npm run test -- --coverage
npm run check:compiled
npm run preview
```

Preview serves http://localhost:5176/assets/remoteEntry.js. The Host mounts salesPortal/App at /sales. The standalone HTML only explains how to open the portal; it does not mount another router, navigation, fonts, session or HTTP client. Federation uses build/preview, not a Vite development server.

The remote consumes shell/apiClient and shell/session from the Host entry (local default http://localhost:5173/assets/remoteEntry.js) and shares React/React DOM. The recorded Products-compatible configuration uses esnext without module preload/CSS split/minification to preserve CSS placeholder substitution. check:compiled checks the stable entry, App exposure, resolved placeholders and absence of a private transport, absolute API URLs or credentials.

History requests GET /api/v1/sales with page=1, limit=20 and optional from/to/customerId. Dates are inclusive UTC calendar days without local conversion. Filters validate calendar dates, range order and complete UUIDs, associate field errors and focus the first invalid field. Applying/clearing filters resets page 1. Pagination uses all meta fields, rejects invalid pages and corrects disappeared pages after reload.

Each change cancels the previous request and ignores late responses. Loading retains headers/filters with skeleton rows; errors use Spanish UI copy and traceId; empty state can clear/reload; populated state uses only server data. Retry retains the applied page/filters. A 401 delegates session/redirection to the Host; 403 shows access denied without automatic retry or substitute data. The server enforces ADMIN/SALESPERSON ownership; the Host blocks INVENTORY. There is no in-memory authorization filter or client-supplied ownership override.

Dates render as es-CO / America/Bogota. Authoritative COP totals use exact BigInt quotient/remainder with two decimals, never line sums or floating financial arithmetic. Host int64 deserialization as number cannot recover precision already lost outside Number.MAX_SAFE_INTEGER; the UI then displays the localized unsafe-range message. Full int64 transport remains a separate shared-contract decision.

History displays the full customer UUID without N+1 lookups; names resolve only in composed detail. The View action opens /sales/{id}. CSS Modules consume Host tokens in both themes; there is no private global :root/color/font system. See [visual parity](visual-parity.md) and [verification/Host boundaries](verification.md).

Vitest, Testing Library, user-event, jsdom and V8 use shell doubles. Simulated business data exists only in tests; unit tests perform no HTTP and need no backend/database. Statement floors are 70% global and for Sales, including production modules.
