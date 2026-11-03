# Sales reports and dashboard summary — design (HU-FE-09)

Status: design written **before** the tests and the code (test-first). Nothing here claims a
verified execution; see [Verification](#verification) for what has actually been run.

## Scope

The Sales portal owns the three report screens and a read-only dashboard summary that the Host
mounts. It consumes only the Sales contract already delivered in `synkro-docs`
(`07-api/contracts/openapi/synkro-sales-api.yaml`):

| Screen | Route (owned by Sales under the Host's `/sales/*`) | Endpoint |
|---|---|---|
| Daily totals | `/sales/reports/daily` (`/sales/reports` shows the same screen) | `GET /api/v1/sales/reports/daily` |
| Monthly totals | `/sales/reports/monthly` | `GET /api/v1/sales/reports/monthly` |
| Top products | `/sales/reports/top-products` | `GET /api/v1/sales/reports/top-products` |
| Dashboard summary | no route: federated module `./DashboardSummary` | the three endpoints above, `limit` 1 / 1 / 3 |

No new API, aggregate, cache or metric is introduced. Fields shown are exactly those of the
contract: `day`/`month`, `dailyTotalCents`/`monthlyTotalCents`, `saleCount`, `productId`,
`totalQuantity`, `totalRevenueCents`. Profit, user counts, stock and any total that is not the sum
of a returned page are **not** shown.

`/sales/reports` must be matched before the sale-detail route (`/sales/{id}`), otherwise `reports`
would be read as a sale id.

## Ownership and boundaries

- Transport and session stay in the Host: every request goes through `shell/apiClient` and the
  role is read from `shell/session`. No `fetch`, no token, no second client (a source-contract test
  already enforces it and keeps doing so).
- The Host integrates; it does not copy the rules. Money formatting, UTC dates, ownership wording
  and the four states live here, once, and the Host's dashboard renders the exported module.
- Authorisation is the server's. `SALESPERSON` receives only their own contribution (the token
  decides; ownership is never a query parameter). The portal never sends `createdBy` or similar.
  `INVENTORY` is denied by the Host route guard before the portal mounts; as defence in depth the
  portal itself renders a "no permission" notice and **does not issue any report request** for a
  role other than `ADMIN`/`SALESPERSON`. A `403` from the API shows the same notice, with no retry.

## Query semantics

- Filters `from` / `to`: RFC 3339 full dates, both **inclusive**, interpreted as **UTC days**.
  Blank filters are omitted (the API rejects empty parameters with 400). `from > to` is rejected in
  the form (same rule as the history filter) and never sent. Equal dates are valid.
- Only `page`, `limit`, `from`, `to` are sent. `limit` is fixed at 20 (contract default); `page`
  starts at 1. `meta.total` counts groups, not sales, and the pagination text says so
  ("registros" per kind: días, meses, productos).
- A page past the end (data shrank) is corrected to the last page, never page 0 (same as history).
- Money is `int64` cents. Values outside the JS safe-integer range are **not rounded**: they show
  "Importe fuera del rango seguro" (existing `formatCents`). Cents are formatted without floating
  point.
- Days and months are formatted with `timeZone: 'UTC'` so a Bogotá viewer never sees the previous
  day. The machine-readable `<time dateTime>` keeps the contract value.

## Four states (all three screens and each summary tile)

| State | Behaviour |
|---|---|
| Loading | `role="status"` text plus a skeleton table; table `aria-busy` |
| Empty | Unfiltered: "Todavía no hay ventas para este reporte." Filtered: "Ningún resultado coincide con estos filtros." with "Limpiar filtros" |
| Error | `role="alert"`, a message per cause (401 session ended, 403 no permission, other / network), the trace id when present, and **Reintentar** for retryable causes |
| Data | accessible table (`caption`, `scope="col"`, numeric columns right-aligned, tabular figures) and pagination |

## Races and cancellation

One hook, `useReport`, owns the query. Every change of kind, filter, page or retry aborts the
previous request (`AbortController` passed to the Host client) and the answer is stored together
with the query/attempt it belongs to, so a response that arrives late can never replace the state
of the current filter — even if the client ignores the abort. Unmount aborts too. Top-product names
(`GET /api/v1/products/{id}`) are optional enrichment: they are aborted with the page, a failure
keeps the raw `productId` (never an invented name), and they never block the report.

## Dashboard summary (`./DashboardSummary`)

Three independent tiles, each with its own four states so one failing endpoint does not hide the
others:

1. **Último día con ventas** — first row of the daily report (newest first): day, total, sale count.
2. **Mes más reciente** — first row of the monthly report.
3. **Productos más vendidos** — first 3 rows of top-products (all-time, unfiltered, labelled so).

Wording does not claim "today" or "this month": the endpoint returns the newest group that has
sales. For `SALESPERSON` the heading says "Tu contribución"; the numbers are whatever the server
scoped. Each tile links to its full report with the portal's `PortalLink` (history API +
`popstate`, no document load, so the Host's in-memory session survives).

## Navigation inside Sales

A small section navigation (`Historial · Diarios · Mensuales · Más vendidos`, `aria-current="page"`
on the active entry) is shown on the history and report screens. It uses `PortalLink`.

## Visual rules

Tokens only (`visualContract.test.ts` still forbids palettes, `:root`, fonts). Reuse the portal's
`Button`, `Field`, `SalesState` and pagination styles; table styles are shared with the history
table. Focus ring and dark scheme follow the existing rules; layout wraps on narrow widths and only
the table scrolls horizontally.

## Test plan (written first)

- `model/reportFormatting`: UTC day/month, cents, unsafe amounts.
- `api/reportsApi`: paths, whitelisted query, no empty params, no ownership params, invalid
  filters rejected before any request.
- `pages/useReport`: abort on change, late response ignored, retry, page correction.
- `components`/pages: the four states per screen, filters (inclusive UTC, reversed range),
  pagination, 403/401 messages, INVENTORY issues zero requests, SALESPERSON copy.
- `routes`: `/sales/reports*` do not become sale details.
- `DashboardSummary`: three tiles, partial failure, retry, links.
- `sourceContract`/federation config: one extra exposed module, still no fetch/storage/router.

## Verification

Filled in the PR and in `docs/verification-hu-fe-09.md` once real executions exist, separating
mock-based tests from real-service browser runs and recording exact revisions.
