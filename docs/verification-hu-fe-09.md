# HU-FE-09 — verification record (Sales portal)

Issue: `code-corhuila/synkro-docs#294`. Design: [`reports-design.md`](reports-design.md). The Host side
and the shared browser evidence are recorded in `synkro-front/docs/dashboard-and-login-verification.md`
(same revisions table).

Base: `develop` = `d691eec160ba50ed417e5acbbe5d02496f2dea8d`. Branch
`feat/sales-reports-and-dashboard-summary`. Node v25.7.0 (the package asks `>=22 <23`).

## Test-first

RED (before implementation): 5 new test files failed to import their modules
(`reportFormatting`, `reportsApi`, `useReport`, `ReportsPage`, `DashboardSummary`); `reportRoutes`
failed because `/sales/reports` was parsed as the detail of a sale named "reports"; the federation
exposes assertion failed (`./DashboardSummary` missing). A later test (`SalesPage.sections`) was red
before the section navigation was added.

GREEN (after implementation):

- `npx vitest run`: `Test Files 28 passed | 1 failed`, `Tests 307 passed | 1 failed`. The single
  failure is **pre-existing**: `registrationRecovery.test.tsx` "almacenamiento bloqueado impide
  iniciar un POST…" fails identically on untouched `develop` under Node v25.7.0.
- Excluding that file: `28 passed`, `298 passed`; coverage statements 94.39 % (floors unchanged: 70 %
  global and for `src/sales/**`).
- `npm run lint` clean, `tsc -b` clean, `npm run build` and `npm run check:compiled` pass.

One existing assertion changed on purpose: `remote.test.tsx` used `/sales/reports` as an example of a
non-UUID sale id ("Venta no encontrada"); that path is now a real screen, so the example is
`/sales/no-es-un-uuid`.

## Real browser run

See the Host record: the Sales build was loaded by the Host through Module Federation and exercised in
the built-in browser against a **mock gateway** (not the real Sales API). Reports, filters, UTC edges,
race, error/retry, roles and viewports are listed there. The comparison with the real Sales API is
**not executed** (open item).

## Contract notes

- Only `page`, `limit`, `from`, `to` are sent; blank filters are omitted; ownership is never a
  parameter.
- `INVENTORY`/unknown roles issue no report request (screen shows the permission notice; dashboard
  summary renders nothing).
- Report endpoints: `daily`, `monthly`, `top-products`; money is integer cents; days and months are
  formatted in UTC.
