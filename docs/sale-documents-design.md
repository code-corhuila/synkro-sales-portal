# HU-VEN-19 — sale document downloads (PDF and XML)

Refs code-corhuila/synkro-docs#301. This page is the design, the field-origin record and the
verification status of the download of a sale as PDF and XML from the sale detail. It does not close the story and it
does not claim fiscal validity: see [Commercial scope](#commercial-scope-and-fiscal-limits).

Status (2026-11-07): implemented and verified with unit, component, integration-with-doubles and real-browser tests.
**Real-service acceptance (ADMIN, owner SALESPERSON, foreign sale) has not been run**; see
[Real-service acceptance](#real-service-acceptance-pending). Remote CI and owner review are pending.

## Criteria, tests and components

| Criterion | Components | Tests that prove it |
|---|---|---|
| **VEN19-01** an authorized user downloads PDF and XML of the same sale; data and amounts match the persisted detail | `SaleDocumentDownloads` (buttons) → `useSaleDocumentDownload` → `prepareSaleDocument` → `loadSaleDocumentSources` + `buildSaleDocument` → `renderSaleDocument` (`buildSaleDocumentPdf` / `buildSaleDocumentXml`) → `downloadBlob` | `saleDocumentConsistency.test.ts` (PDF text read back with pdf.js and XML compared with the persisted sale, 45 lines, several pages), `buildSaleDocument.test.ts`, `saleDocumentXml.test.ts`, `SaleDocumentDownloads.test.tsx` (descarga), `SaleDetailPage.documents.test.tsx`, `downloadBlob.test.ts`; browser run below |
| **VEN19-02** a nonexistent or unauthorized sale gives the matching result without exposing another account's data; a generation failure offers retry | `saleDocumentApi` (401/403/404/other translation), `SaleDocumentError`, the status and alert region of `SaleDocumentDownloads` | `saleDocumentApi.test.ts` (autorización y errores; no partial result after the first failure), `SaleDocumentDownloads.test.tsx` (errores y reintento, respuestas obsoletas y limpieza), `renderSaleDocument.test.ts`, `documentSource.test.ts` |
| **VEN19-03** the approved SynkroTech layout handles long and multiline documents and special characters; the XML validates against the agreed schema | `pdf/buildSaleDocumentPdf.ts`, `pdf/assets.ts`, `pdf/format.ts`, `text.ts`, `saleDocumentXml.ts`, `docs/schemas/sale-document-1.1.xsd` | `pdf/saleDocumentPdf.test.ts` (one page, long documents, special characters, logo; selectable text, accents/ñ, pagination, repeating header, page numbers, no overlap), `saleDocumentXml.test.ts` (validated against the XSD with xmllint-wasm; escaping), the rendered samples in [docs/examples/sale-document](examples/sale-document) |
| **VEN19-04** fiscal requirements and limitations are recorded and verified before any compliance claim | the fixed notice printed in the PDF, `documentType=COMMERCIAL_RECEIPT` and `fiscalValidity=NONE` in the XML | `saleDocumentPdf.test.ts` and `saleDocumentXml.test.ts` assert the notice and `NONE`, and that the files contain no CUFE, QR, resolution, signature or tax breakdown; this document |

## Where every field comes from

Nothing is repriced and nothing is invented. Four kinds of origin, kept apart in the XML through the `origin` attribute:

| Field | Origin | Notes |
|---|---|---|
| Full `saleId`, sale date, status (active/voided), `createdBy` is **not** printed | **Persisted history** — `GET /api/v1/sales/{id}` | ADMIN reads any sale, SALESPERSON only their own, INVENTORY gets 403. The Host client and session are reused; the portal adds no permission. |
| Lines: product id, quantity, unit price in cents, subtotal in cents; total in cents | **Persisted history** — same response | Integer cents (COP, 2 digits), formatted only for display. Never recomputed from the catalogue. |
| Customer name, document, address, phone, email | **Current data from another service** — `GET /api/v1/customers/{id}` | "Document" is the contract's one `identityDocument` field (whatever the customer record stores — cédula or NIT — as free text); there is no separately typed or validated fiscal NIT, see the row below. The customers service answers 404 for an inactive customer, so its current fields are omitted and an explicit unavailable reference is exported under the owner-approved policy. Optional fields are omitted when absent. |
| Product name and category | **Current data from another service** — `GET /api/v1/products/{id}` and the paginated categories list | An inactive product is visible only to ADMIN/INVENTORY; SALESPERSON exports its persisted productId and an unavailable marker instead of hidden current data. The category exists only in the paginated list; a line is rendered without category if it is not found. |
| Issuer legal name, NIT, address, phone, email | **Issuer configuration** — build-time `VITE_ISSUER_*` | Owner-confirmed public deployment defaults, overridable at build time. See [Issuer configuration](#issuer-configuration). |
| Generation instant | The browser clock at export time | Shown in Bogotá time; the sale date is also shown in Bogotá time. The XML carries UTC instants. |
| Seller name | **Unavailable to this role, not nonexistent** | `createdBy` is an id; the name needs the ADMIN-only `/auth/users/{id}`, which this feature does not call. The data exists; this feature does not have access to it. It is omitted, not guessed. |
| A separately typed/validated customer NIT | **Not a distinct field** | The Customers contract has no fiscal NIT type, verification digit or taxpayer classification separate from `identityDocument` (above). The document does not invent a second "NIT" value. |
| "Valor en letras" (amount written out in words) | **Not an API field; a derived display convention** | Writing an amount in words is computed from `totalCents`, not read from any service. It was never a contract requirement either way; this document does not implement it. |
| Consecutive/invoice number, SKU, unit of measure, taxes (no 19 % IVA), payment method, resolution, CUFE, QR | **Do not exist in any contract** | Not printed and not in the XML. The values of the HTML reference (`factura-opcion-a.html`) were demo content and are not domain requirements. |

### What the downloaded file does not freeze

The platform keeps no historical snapshot of customer, product or category. What is persisted is the sale, its lines, unit
prices and total. Therefore the file is **a view generated now**: amounts, date and status equal the persisted sale, but
customer data and product/category names are the current ones. A file generated later can differ in those fields. The files
say so (notice in the PDF; `origin="CURRENT_RECORD"` in the XML). This feature adds no snapshots and no migrations and
does not claim immutability.

When an authorized source supplies a voided model, the renderer exports it as voided: the PDF carries a diagonal "ANULADA" stamp and the status "Anulada", the XML has
`<status>VOIDED</status>`. It is never presented as active. The selected Sales API currently returns404 for inactive sales and exposes no public void operation; end-to-end retrieval of an annulled sale is therefore not claimed.

## Common model and generation

`buildSaleDocument` turns the persisted sale, the customer, the products, the categories, the issuer and `now` into one
`SaleDocument`. PDF and XML are both rendered from that object, so they cannot disagree (`saleDocumentConsistency.test.ts`).
The builder validates before rendering and fails with a `SaleDocumentError` (`INVALID_SALE`, `CUSTOMER_UNAVAILABLE`,
`PRODUCT_UNAVAILABLE`, `ISSUER_CONFIG`, `GENERATION_FAILED`, plus access/transport codes) instead of producing a partial
document: the sale needs a valid date and at least one line, quantities are positive integers within 32 bits, cents are
safe integers, each subtotal equals quantity × unit price and the total equals the sum of the lines (stored values are
checked, never recomputed into the file). `assertRenderable` repeats the check on the model right before rendering. A sale
of 100 lines (the Sales API maximum) is covered by a test.

`sanitizeText` is the one text policy shared by both files: NFC, control characters and lone surrogates replaced by U+FFFD,
runs of whitespace collapsed. Optional values that are empty are omitted (never `undefined`/`null`).

Source reads (`loadSaleDocumentSources`) run through the shared pool with 4 concurrent requests, cancel the rest after the
first failure and honour an `AbortSignal`.

### PDF

Generated in the browser with `pdf-lib` + `@pdf-lib/fontkit`; no `fetch`, no remote fonts. The fonts (Big Shoulders Display,
IBM Plex Sans, JetBrains Mono, from `@fontsource`) and the logo are bundled as data URLs and decoded locally. The PDF code
is a lazy chunk, loaded only when a PDF is requested (about 2 MB; the XML path does not load it).

Layout follows the chosen visual reference (option A): dark header with the logo on a light card and a red accent line,
issuer and customer blocks, product table, highlighted total and footer. It is print design, independent of the dark theme
of the app. Letter size, 42 pt margins. Long product names wrap (a word wider than the column is broken by characters, so
nothing is clipped); a row moves whole to the next page and only a row taller than a whole page is split by lines; from
page 2 a compact header and the table header repeat; the footer carries the sale id and "Página n de N". The
commercial-scope notice sits under the total and moves to the next page if it would not fit. Text is real, selectable
text, with accents and ñ.

Adaptations to the HTML reference: no consecutive number, SKU, tax column or payment method — none exist in any contract.
No separate "NIT del cliente" field: the customer's `identityDocument` is already printed in the customer block (see
[Where every field comes from](#where-every-field-comes-from)); this layout does not duplicate it under a NIT label, and
does not type or validate it as a fiscal NIT. No "valor en letras": writing the total in words is a derived display
convention, not an API field either present or absent, and it was not implemented. No seller name: that data exists
(`createdBy` resolved through the ADMIN-only `/auth/users/{id}`) but this feature does not call that endpoint, so the name
is unavailable here, not nonexistent. The title is "Comprobante de venta"; the notice about scope is added; the status
stamp is added for voided sales. Glyph coverage is that of the bundled fonts (Latin); a character outside it is drawn as
"?" in the PDF so the layout never breaks, while the XML keeps the exact text.

### XML

Namespace `urn:synkro:sales:sale-document:1.1`, `schemaVersion="1.1"`, schema in
[`docs/schemas/sale-document-1.1.xsd`](schemas/sale-document-1.1.xsd). It is a Synkro document, not UBL or DIAN:
`documentType=COMMERCIAL_RECEIPT`, `fiscalValidity=NONE`. Amounts are integer minor units (`unitPriceCents`,
`subtotalCents`, `totalCents`) with `<currency minorUnitDigits="2">COP</currency>`. Instants are UTC. Every text first goes
through `sanitizeText` (characters not allowed by XML 1.0 become U+FFFD) and is then escaped by `escapeXml` for text and
attribute positions, and the output is validated against the XSD in the tests with `xmllint-wasm`. A schema change must bump `schemaVersion` and the file name.
Sanitized example: [`examples/sale-document/sale-document.xml`](examples/sale-document/sale-document.xml).

## Commercial scope and fiscal limits

The document is titled "Comprobante de venta" and prints, under the total: *Comprobante de venta de alcance comercial. Este
documento no es una factura electrónica de venta ni un documento tributario validado: no incluye consecutivo de
facturación, CUFE, código QR, resolución ni firma digital, y no discrimina impuestos.* It is not an electronic invoice, it
has no CUFE, QR, DIAN numbering resolution or digital signature, and it does not break down taxes. Becoming a fiscal
document needs requirements (numbering, taxes, customer NIT, issuer resolution, electronic invoicing provider) that no
Synkro service owns today; they must be decided and verified before the words "factura electrónica" or any compliance
claim are used. This portal makes none.

## Access, states and errors

* The buttons "Descargar PDF" / "Descargar XML" are in the sale detail, rendered only for ADMIN and SALESPERSON. The
  visibility is a convenience; the server decides. INVENTORY sees no button. SALESPERSON gets no extra permission: a foreign
  sale answers 403 from the Sales API, shown as a generic Spanish message with no data of the other account.
* States: idle → "Preparando PDF/XML…" (both buttons disabled, status region announced) → "PDF/XML descargado." or an
  alert with the Spanish message and the trace reference when the backend gave one.
* **Reintentar** is offered when trying again can help (generation failure, network/other failure). It is not offered for
  expired session (the Host session lifecycle is not changed; the user is told to sign in again), no access, sale not
  found, customer or product unavailable, inconsistent sale or missing issuer configuration (which names the variables).
  English backend messages are never shown.
* One download at a time (duplicate clicks are ignored); changing the sale or unmounting aborts the work and a late
  response never updates the page or starts a download. The Object URL is revoked after the click; the file name is
  `comprobante-venta-<saleId>.pdf|xml`, reduced to `[A-Za-z0-9-]` and at most 64 characters, with MIME
  `application/pdf` / `application/xml`.

## Issuer configuration

The issuer is public build configuration with owner-confirmed deployment defaults (synkro tech sas, NIT 803.256.942-7); without it the downloads refuse to generate and say which
variables are missing. Docker/Compose and .env.example carry these confirmed values; an explicit empty override still refuses generation. Direct npm builds must load .env using the existing setup:

| Variable | Required | Notes |
|---|---|---|
| `VITE_ISSUER_LEGAL_NAME` | yes | Legal name as it must appear. |
| `VITE_ISSUER_TAX_ID` | yes | The company NIT, with verification digit. |
| `VITE_ISSUER_ADDRESS`, `VITE_ISSUER_PHONE`, `VITE_ISSUER_EMAIL` | no | Omitted from both files when empty. |

Values that look like the template's examples (`XXX`, `.example`, all zeros, "Calle 00") are rejected. They go through
`.env`, `deploy/compose.yml` build args and the `deploy/Dockerfile` `ARG`/`ENV`, and are inlined into the bundle: they
are public company data, never secrets. A value containing ` #` must be quoted in an env file, otherwise the rest of the
line is a comment.

## Known limits

* A related-record404 is represented explicitly by its persisted reference and an unavailable marker, never by a guessed name or an alternate privileged lookup. It does not prove whether the record was deleted, hidden or inactive. Other failures still stop generation.
* No seller name (unavailable to this feature, see [Where every field comes from](#where-every-field-comes-from), not
  nonexistent data); no category when the list does not return it; no historical snapshot (see above).
* The PDF fonts cover Latin text only (other characters print as "?" in the PDF).
* The bundled logo file has a watermark ("design.com") and a mint background; a clean asset should replace
  `src/sales/document/pdf/assets/synkro-logo.png`.
* `pdf-lib` is pinned (1.17.1); its JSDoc is stripped from the build because the compiled
  check rejects network-API words in comments.

## Verification record

Process note: the design above was written down after the code and the tests had been developed, not before. The tests
were nevertheless written before the production code: the first run of the new test files against a tree without the
implementation failed (10 of 12 new files could not load their modules, 3 tests failed, 9 existing/ancillary tests
passed), the following runs went down to the last failing assertion and then to green.

Original implementation record (Node22.23.4); superseded by the completion verification below:

* `npm run test -- --coverage`: 46 files, 482 tests passed (baseline before this work: 35 files, 348 tests), twice in a row.
  Coverage: all files 96.88 % statements, 93.76 % branches, 99.5 % functions, 99.39 % lines; `src/sales/document` 95.94 %,
  `src/sales/document/pdf` 98.44 %, `src/sales/api` 98.41 % statements (threshold 70 %). PDF generation is shared between
  tests of the same document because, with v8 coverage, building a PDF is ~10× slower and starved an unrelated
  navigation test (5 s default timeout) in the earlier runs.
* `npm run lint` clean; `npm run build` (`tsc -b` + Vite) passes; `npm run check:compiled` passes (the PDF chunk is
  `buildSaleDocumentPdf-*.js`, 2.0 MB / 770 KB gzip, lazy).
* `python -m unittest discover -s tests` (via `py`): 2 tests OK, including the issuer build args.
* Not run: container image build and `nginx -t` (Docker is shared and the coordination lease was not available; the
  Compose model is covered by the Python tests).

Real browser (built-in Chromium pane, Vite dev server with the real `SaleDetailPage` and the real generators; **services
simulated**, so this is not the real-service acceptance): SALESPERSON with a 60-line sale generated a 5-page PDF
(`application/pdf`, 76 KB) and a 25 KB `application/xml` through the page's own download; both named
`comprobante-venta-<saleId>.*`, Object URLs revoked, buttons disabled while preparing. The saved PDF was opened and
rendered page by page (pdf.js): text, accents, ñ, quotes, `&` and `<especial>` correct, header and table header repeated,
page numbers "n de 5", no overlap, notice and total on the last page. The saved XML validated against the XSD
(`valid: true`). A simulated failure on the second read showed the alert with the trace reference and **Reintentar**, which
completed the download. INVENTORY showed no buttons. Samples (synthetic data, no sensitive data) are in
[docs/examples/sale-document](examples/sale-document): `pdf-active-1-page.png`, `pdf-voided.png`,
`pdf-multipage-p1.png`, `pdf-multipage-last.png` and `sale-document.xml`.

## Real-service acceptance (pending)

Not run. Docker was in use by another task's isolated stack (containers `synkro-isolated-…-runner/daemon`), no
`HEAVY-DOCKER.lock` lease could be found to take, and a disposable full stack (Auth, Customers, Products, Sales, their
databases, Gateway, Front) is a heavy build; it was not started on top of someone else's run. Mocks do not replace it.
To run it:

1. Take the `HEAVY-DOCKER.lock` lease as in `synkro-auth-api/docs/hu-auth-15-verify-admin-registration.md`, then build a
   disposable stack from clean checkouts of the released tags, as described in
   [verification-hu-ven-12.md](verification-hu-ven-12.md), with this portal built with the `VITE_ISSUER_*` values and
   `VITE_BASE_PATH=/remotes/sales/`. Use only your own fixtures and containers; remove them by exact name afterwards.
2. Create one ADMIN and two SALESPERSON users through Auth, one customer, two active products, one sale by each
   SALESPERSON, one voided sale.
3. As ADMIN: download PDF and XML of a sale of each SALESPERSON. As the owner SALESPERSON: download PDF and XML of their
   own sale. As the owner SALESPERSON: open the other one's sale by URL and try the download — expect 403 and no data.
4. Compare each file with `GET /api/v1/sales/{id}` (id, date, status, quantities, cents, total) and with the customer and
   product reads; check the XML against the XSD and the PDF visually. Record the result here; only then tick criteria.

## Owner-approved completion design (2026-11-07)

Before implementing this follow-up, the owner selected reference-only exports when related current records
are unavailable, and confirmed the public issuer values above. Only a real404 from an authorized related-record
request becomes null. Sales itself must be authorized first; a sale401/403/404 stops before related reads.
A related401/403/429/5xx, network failure, wrong-identity response or malformed successful record still fails closed.
No role escalation, catalogue scan, backend contract change, migration or historical snapshot was introduced.

In both formats, historical identifiers, amounts and quantities remain complete. PDF shows the persisted
customer/product reference with “Datos actuales no disponibles”. XML1.1 uses origin="UNAVAILABLE" and an
unavailable element instead of inventing a name or identityDocument. Available records retain CURRENT_RECORD.
The XML declaration remains XML1.0; only the commercial schema/namespace is1.1. The earlier1.0 XSD is retained
as a historical schema, not the newly generated format. Missing current metadata is explicit, never silent.

A behavioral RED regression reproduced the original404 export failure before this follow-up was applied.
Identity mismatch and malformed active-flag checks from Claude were reviewed and are verified alongside it.
The original late-design process note above remains accurate for the initial implementation.
