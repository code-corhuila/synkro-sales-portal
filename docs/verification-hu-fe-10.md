# HU-FE-10 verification

Story: code-corhuila/synkro-docs#298. Design: [reports design](reports-design.md).

The dashboard uses the existing authorized report queries, one inclusive UTC date range, and daily or monthly grouping. Both charts have adjacent data tables and separate pagination. Changing grouping starts on page one with the applied date range. The chart and its caption describe the visible page.

Local Node 22 verification: 325 tests in 31 files passed. Coverage was 96.98% statements, 95.65% branches, 99.26% functions and 99.47% lines. Lint, TypeScript/Vite build and the compiled Host boundary check passed. Component tests use the existing Host client fixture. End-to-end validation of the combined deployment remains a release check.

## HTML-based dashboard refinement

On 2026-11-07 the working tree based on `b8f00b2` passed 341 tests in 32 files.
Statement coverage was 97.09%, branches 95.80%, functions 99.30% and lines 99.49%.
Lint, TypeScript/Vite and the compiled Host boundary check passed. After correcting a render
purity warning in the quick range control, its dashboard integration tests and build were rerun.

Chrome exercised both themes at desktop width, a 390px viewport without document overflow,
chart selection by keyboard, custom date focus, quick range selection, request failure/retry,
empty results and the INVENTORY restriction. Browser requests used local fixtures.
The visual refinement retains the existing API scopes and quantity-based product ranking.
Full deployment acceptance with live services remains a release check.
