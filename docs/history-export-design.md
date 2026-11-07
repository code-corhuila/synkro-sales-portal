# Sales history Excel download (HU-VEN-18) — design

The design was recorded before implementation. The verification below describes the finished branch.

## Scope

Adds one control to the existing history screen (`/sales`): a button that downloads, as a `.xlsx`
file, every sale the signed-in seller is allowed to read for the **date/customer filters already
applied** to the history table (`SalesFilterBar`/`useSalesHistory`). No new route, no new API, and no
change to `SalesFilterBar`, `SalesTable`, the reports screens, or `DashboardSummary` (left untouched
so `FE-10`, which also touches the dashboard, can merge independently of this branch).

Out of scope: a background job, a server-generated file, an email, or any format other than a
single-sheet `.xlsx`.

## Data design

One row per sale, already resolved to its display form:

| Column header | Source | Type in the sheet |
|---|---|---|
| `Referencia` | `Sale.saleId` | text |
| `Fecha UTC` | `Sale.date`, truncated to its UTC day (`YYYY-MM-DD`) | text |
| `Total COP` | `Sale.totalCents / 100` | number, two decimal places |

`saleId` is the contract's only identifier for a sale (`synkro-sales-api.yaml` has no separate order
number), so the export calls that column "Referencia": the value is exactly `saleId`, the same id the
history table already links through ("Ver venta …") and the detail screen reads.

## Why dates are text, not an Excel date-typed cell

The requirement is an **unambiguous** date. `Sale.date` is truncated to its UTC day and written as an
ISO 8601 string (`2026-11-06`). ISO 8601 has one reading regardless of the opening application's
locale (no `DD/MM` vs `MM/DD` ambiguity), it sorts correctly as plain text, and it avoids relying on
how a given spreadsheet reader chooses to render an Excel serial date. The cost is that the cell is
not a "real" Excel date type (no locale-formatted display, no date arithmetic in-sheet); that trade
favours the explicit requirement ("unambiguous") over a feature nothing in this story asks for.

## Server-side date filtering already exists — no local filtering fallback needed

`GET /api/v1/sales` already accepts `from`/`to` (RFC 3339 **inclusive UTC days**) and `customerId`,
validated the same way the history screen's own filter bar already validates them
(`model/filters.ts`: `cleanFilters`/`validateFilters`, reused as-is). This is the same contract
`reportsApi.ts` already relies on for the report screens. The task's fallback — "bounded paginated
reads and local date filtering" for a contract that does **not** support server-side dates — does not
apply here: the export sends exactly the filters already applied to the table (`history.query`) as
server-side `from`/`to`/`customerId`, through the existing `listSales`, and never re-implements date
comparison in the client.

## Pagination and the seller's scope

`listSales` always asks for a fixed page of 20 (the contract's own limit, hardcoded in `salesApi.ts`
regardless of any `limit` a caller passes) and never sends an ownership parameter. The server derives
the caller's scope from the verified token, so a `SALESPERSON` exporting "their" history is exactly
the rows the server already decided to return, on every page, the same way the table's own pagination
already works. The export reads every page sequentially (`listAllMatchingSales`, the same
await-loop shape `listAllCategories`/`listAllOpenAlerts` use in the Products portal) and stops, with
an explicit error when the result exceeds **50 pages or 1,000 rows**. If later pages disagree with
the first total or the collected references contain duplicates, the export fails and asks the
user to retry.

**A page that fails fails the whole export.** If any page's request rejects (a `401`, a `403`, a
network failure), the whole promise rejects and no workbook is ever built from a partial read. The
error distinguishes an expired session (401) from lack of permission (403). Other request
failures show a retry message.

## Workbook construction

- `write-excel-file` is loaded on demand and creates a local XLSX `Blob`. The test suite uses
  ExcelJS as an independent reader.
- The sheet is named `Historial` and contains one row per sale. References pass through
  `safeText` and are written as strings. The UTC date is also a string.
- `Total COP` is numeric with two decimal places. Amounts beyond Excel's supported precision
  stop the export with an explicit error.
- `downloadBlob` downloads the file as `historial-ventas.xlsx`.

## States and copy

One small component, `HistoryExport`, sits right after `SalesFilterBar`, inside the history section:

- **Idle**: "Descargar Excel" (secondary button).
- **Pending**: the live region announces "Generando archivo…" and the download button is disabled.
- **Done**: the live region announces "Historial descargado".
- **Error**: an inline `role="alert"` explains the failure. The button is enabled again for retry.

Spanish text is inlined directly in the component, the same way `SalesError.tsx`/`SalesFilterBar.tsx`
already do in this portal (unlike the Products portal, this repository has no dedicated copy module
or a test enforcing one, so the new code follows this repository's own existing convention instead of
introducing a new one).

## Accessibility and keyboard

The button is the shared `Button` component and sits in the existing tab order, after the filter
bar's "Limpiar filtros" and before the table. Nothing here introduces a modal or a colour-only
signal: the error alert carries the message in text, on the same card background `SalesError`
already uses.

## Verification

Node 22 passed the 312-test suite and two additional component checks. The tests cover pagination,
filter forwarding, rejected permissions, duplicate references and reading the generated workbook
with an independent library. Lint, TypeScript/Vite and the compiled Host boundary check passed.
The checks use fixtures. Browser acceptance against the deployed stack remains a release check.
