# HU-FE-10 verification

Story: code-corhuila/synkro-docs#298. Design: [reports design](reports-design.md).

The dashboard uses the existing authorized report queries, one inclusive UTC date range, and daily or monthly grouping. Both charts have adjacent data tables and separate pagination. Changing grouping starts on page one with the applied date range. The chart and its caption describe the visible page.

Local Node 22 verification: 325 tests in 31 files passed. Coverage was 96.98% statements, 95.65% branches, 99.26% functions and 99.47% lines. Lint, TypeScript/Vite build and the compiled Host boundary check passed. Component tests use the existing Host client fixture. End-to-end validation of the combined deployment remains a release check.
