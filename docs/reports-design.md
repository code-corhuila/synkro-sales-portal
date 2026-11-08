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

## Interactive trend (HU-FE-10)

Status: design written **before** the tests and the code (test-first), same rule as the rest of
this document. Extends `./DashboardSummary` using the existing report endpoints and dependencies.
It preserves the original three summary queries and the existing history and Excel workflows.
The later HTML-based refinement below updates the layout and quick date controls.

### Scope

A fourth, interactive piece of the dashboard summary, below the three tiles and gated by the same
`canReadReports(role)` check (so `INVENTORY` still renders nothing and issues no request): one
shared, inclusive UTC date range drives both a daily/monthly sales series and a top-products
breakdown, each reusing the exact report the full screens already expose
(`GET /api/v1/sales/reports/{daily,monthly,top-products}`, same `page`/`limit`/`from`/`to`
whitelist, same `cleanFilters`/`validateFilters`).

- **Shared range.** One `ReportFilterBar` (reused as-is) feeds both queries at once: applying or
  clearing the filter calls `applyFilters` on the series hook and on the top-products hook
  together, so they can never disagree about the range.
- **Daily/monthly toggle.** Two buttons (`role="group"`, `aria-pressed`) switch which report backs
  the series — `useReport` is called once for the series with the kind itself as state, so the same
  hook instance keeps its `from`/`to` (and page) across the toggle; only the report kind changes,
  exactly the case `useReport.test.ts` already proves does not mix responses.
- **Top-products bars.** A second, independent `useReport('top-products', { limit: 5 })` call is
  filtered by the same shared range. Unlike the static "Productos más vendidos" tile (all-time,
  unfiltered, labelled so), this one honours the range — a different, clearly separate piece of UI.
- **Chart + table.** Each of the two panels (series, top-products) renders one accessible SVG bar
  chart (`aria-hidden`, decorative) immediately followed by the exact same reused table component
  the full report screens use (`ReportTable`, with its caption-equivalent `aria-label`, `scope="col"`
  headers and right-aligned tabular figures) — the table is the one source of truth for assistive
  tech and for anyone who cannot or does not want to read the chart.
- **Visible-limit label.** A chart/table only ever shows the current page. A sentence under each
  pair states, in Spanish, whether that page is the whole range (`"Mostrando los 3 días del rango
  seleccionado."`) or a truncated page of a larger range (`"Mostrando los primeros 20 de 45 días del
  rango seleccionado."`), followed by the existing `ReportPagination` (which already names the total
  and the page size). Neither sentence nor chart is ever presented as the total for the range when
  `meta.totalPages > 1`.
- **Four states, per panel.** Loading (`ReportTableSkeleton`), error (`ReportError`, 401/403 not
  retryable, other causes retryable, trace id shown), empty (`ReportEmpty`, filtered vs. unfiltered
  wording), data — all reused from the existing report components, so one failing panel does not
  hide the other (same rule as the three tiles).
- **Stale responses.** Both panels delegate entirely to `useReport`: every filter/kind/retry change
  aborts the previous request and a late answer can never replace the current one. No new
  cancellation logic is written for this feature.
- **Tokens and focus.** New CSS adds no palette, hex value or `:root`; it only reads existing
  tokens (`--color-primary-500`/`--color-primary-300` for the bars, `--space-*`, `--radius-lg`,
  `--shadow-sm`, the existing font tokens). The toggle buttons and chart bars sit inside the
  dashboard's existing `.summary :focus-visible` rule, so keyboard focus stays visible without a new
  rule.
- **Role scope.** The portal still never sends an ownership parameter; `SALESPERSON` gets whatever
  the token scopes them to. Query-key tests assert the request only ever carries `page`, `limit`
  and, when applied, `from`/`to`.

### Test plan (written first)

- `model/reportFormatting` (`visibleScopeLabel`): whole-range vs. truncated-page wording, singular
  vs. plural, empty range produces no claim.
- `components/SalesTrendChart`: bar count matches the data, zero value never produces a negative or
  NaN height, empty data renders nothing, the chart stays `aria-hidden`.
- `pages/DashboardTrend`:
  - **Range**: applying a range calls both the series and the top-products endpoint with the same
    `from`/`to` and resets both to page 1; clearing does the same with no date params.
  - **Toggle**: switching daily ↔ monthly re-queries the new kind with the *same* `from`/`to`
    already applied — the range is never lost.
  - **Data**: real rows render in the chart and in the reused table with no invented total; the
    visible-limit sentence says "primeros N de M" only when the range has more than one page.
  - **Roles**: the request never carries an ownership parameter (`SALESPERSON`); the whole section
    (inherited from `DashboardSummary`) issues zero requests for `INVENTORY`.
  - **Recovery**: a failing panel shows its own retryable error and recovers on retry without
    disturbing the other panel; a superseded (stale) response is discarded, matching `useReport`'s
    existing contract.
- `DashboardSummary`: unchanged assertions about the three tiles now check the first three report
  calls specifically (`reportCalls().slice(0, 3)`), since the new section issues further calls of
  its own; every other assertion in that suite needed no change.

## Verification

### Dashboard layout from the approved HTML references

HU-FE-10 adopts the supplied light/dark layouts through the existing Host tokens. The Host owns
"Panel de control" and the portal retains "Resumen de ventas" and the seller-specific wording.
Compact summary cards precede a two-column income chart and horizontal product ranking.
Native date controls remain owned by ReportFilterBar. Quick ranges use inclusive UTC days.
The selected quick range reflects the applied query, while Personalizado focuses the first
manual date field. Chart point buttons expose the selected date, amount and sale count with
keyboard support. Data tables remain available in bounded, collapsible regions.

The report contract ranks products by quantity, so bar lengths and the label use units sold.
Revenue remains a secondary value. Summary cards retain their existing, explicit time scopes.
The supplied demonstration totals, growth percentages, categories and seller breakdowns do not
establish new report contracts. Those additions need API design and verification before delivery.
The portal consumes the Host theme and font tokens without loading external fonts.
Its dark rules key off `:root[data-theme='dark']`; a `prefers-color-scheme: dark`
fallback, scoped to `:root:not([data-theme])`, only covers a Host build that has not
started setting that attribute yet, and steps aside the moment the attribute appears
(including `data-theme='light'`).

Filled in the PR and in `docs/verification-hu-fe-09.md` (tiles) and
`docs/verification-hu-fe-10.md` (interactive trend) once real executions exist, separating
mock-based tests from real-service browser runs and recording exact revisions.
