# HU-VEN-19 — sale document downloads (PDF and XML)

## Related-read throttling recovery design

The instrumented real 20-product attempt reproduced document preparation failing with HTTP 429 on product,
customer and category reads. The Gateway limits remain authoritative and unchanged. Before implementing the
follow-up, behavioral regressions demonstrated missing retry/wait/cancellation behavior (3 failures in 9 cases).

Only document source GET operations may retry HTTP 429: at most 3 attempts per operation, through the existing Host
client, retaining the same requested reference/options. Respect its existing retryAt timestamp; if absent,
wait 1 s then 2 s. The cumulative waiting budget is 10 s; a future retryAt beyond the remaining budget fails instead
of retrying early. Caller cancellation interrupts waits and prevents further reads. 401/403/404, network errors,
5xx, malformed data and identity mismatches are never automatically retried by this policy. Exhaustion remains
a failed preparation with the existing manual retry/error handling; no partial file is emitted. This changes no
authorization, mutation/idempotency behavior, Host session ownership or Gateway setting.

Refs code-corhuila/synkro-docs#301. This page is the design, the field-origin record and the
verification status of the download of a sale as PDF and XML from the sale detail. It does not close the story and it
does not claim fiscal validity: see [Commercial scope](#commercial-scope-and-fiscal-limits).

Status (2026-11-07): implementation, final repository gates and targeted real-service acceptance passed.
See [Completion verification](#completion-verification). Peer review, hosted CI and controlled promotion remain
separate delivery steps; the HU is not closed. This is not a new full21/21 platform acceptance.

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

Source reads (`loadSaleDocumentSources`) use the shared pool with at most4 concurrent requests and honour the caller's `AbortSignal`. A read failure prevents a download; requests already in flight are not claimed to be cancelled by that failure.

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

* A related-record 404 is represented explicitly by its persisted reference and an unavailable marker, never by a guessed name or an alternate privileged lookup. It does not prove whether the record was deleted, hidden or inactive. Other failures still stop generation.
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

## Real-service acceptance

The targeted real-service run is complete; see the exact revisions and scope below. The fixture starts an owned
disposable Gateway/Auth/Customers/Products/Sales/Workflow mesh with PostgreSQL and MongoDB and the real built
Host/remotes. Users and active sales are created only through public APIs and the Workflow saga.

To repeat: freeze the desired revisions and committed dependency lock, take the shared heavy-execution lease,
build the owned fixture, create ADMIN/two SALESPERSON/INVENTORY identities, then compare authorized PDF/XML
downloads with the real Sales detail. Include foreign403, INVENTORY 403, anonymous 401, missing-sale404,
related-record 404 reference-only exports, multipage readback/schema validation and transport failure/retry.
Use a clearly identified synthetic issuer override for fixture documents, never production defaults silently
relabelled as a test company. Retire only the owned fixture resources and release its own lease.

## Owner-approved completion design (2026-11-07)

Before implementing this follow-up, the owner selected reference-only exports when related current records
are unavailable, and confirmed the public issuer values above. Only a real404 from an authorized related-record
request becomes null. Sales itself must be authorized first; a sale401/403/404 stops before related reads.
A related401/403/429/5xx, network failure, wrong-identity response or malformed successful record still fails closed.
No role escalation, catalogue scan, backend contract change, migration or historical snapshot was introduced.

In both formats, historical identifiers, amounts and quantities remain complete. PDF shows the persisted
customer/product reference with “Datos actuales no disponibles”. The commercial XML schema 1.1 uses origin="UNAVAILABLE" and an
unavailable element instead of inventing a name or identityDocument. Available records retain CURRENT_RECORD.
The XML declaration remains XML 1.0; only the commercial schema/namespace is1.1. The earlier 1.0 XSD is retained
as a historical schema, not the newly generated format. Missing current metadata is explicit, never silent.

A behavioral RED regression reproduced the original404 export failure before this follow-up was applied.
Identity mismatch and malformed active-flag checks from Claude were reviewed and are verified alongside it.
The original late-design process note above remains accurate for the initial implementation.

## Completion verification

Runtime candidate: `625c889738655b1a6375ebe775c731b477a3e494`. Private acceptance root: `ce5c861148e833826e937b4d28b78a6d40da33af`;
committed lock SHA-256: `a9b91cfda34e972306c664b1bac83fb8a09716a0bb29bc3a21592fb9c5d52272`. Public fixture baseline: Infra `c2da13b7ae83696037d74a7543ba4af84f04ce57` and its committed dependency lock. The root is test-only: it selects the exact Sales Portal
candidate and retains the other 16 owner revisions from the previously accepted FE-11 QA selection.
It adds the document checks and a synthetic issuer override; no public Infra or backend contract was changed.

- Local Node 22.23.3: **508/508 tests**, 48 files, using `npm run test -- --coverage --maxWorkers=1`.
  Coverage: 96.57% statements, 93.49% branches, 99.51% functions, 99.26% lines. Lint, TypeScript/Vite build,
  compiled boundary and **3/3 Python deployment checks** passed. No test assertions or deadlines were relaxed.
- Additional static UI audit reports 3 findings in unchanged develop components (native date/select ownership
  and the generic Button action heuristic). All 3 files were verified unchanged by this PR. It is not claimed
  as a globally clean static UI audit; generated audit JSON stays outside the product repository.
- Behavior-first follow-ups: a related-record 404 blocked generation before the reference policy; two 200/null
  regressions failed before the response validation fix. Product-id mismatch and ambiguous sale.active values
  are rejected. Follow-up regression evidence is retained outside the product repo.
- **11/11 targeted real-service checks** passed with 4 real UI logins and **5 independently read PDF/XML pairs**:
  ADMIN own/other seller, owner SALESPERSON, a multipage sale, and references after actual customer/product
  deactivation. XML validated against XSD 1.1 and file amounts/identifiers matched real persisted Sales responses.
  PDF readback checked names, Spanish accents and exact cent amounts; all downloaded pages were rendered for review.
- Actual foreign-sale 403, INVENTORY 403, anonymous 401 and nonexistent-sale 404 were observed. No foreign download
  was produced. A real transport abort exposed retry and the subsequent real request downloaded successfully.
- Real composed container build and `nginx -t` passed. The synthetic issuer reached the served bundle, as checked
  from both downloaded formats. Product deployment defaults remain the owner-confirmed public name/NIT above.
- The successful browser run still observed 4 HTTP 429 responses (3 product reads and 1 sale read); the application completed its checks without increasing Gateway limits.
- Internal/export/outer cleanup passed. The workstation's preexisting synkro-dev database was preserved and the
  heavy-execution lease released. Cache was reused, not pruned.
- This is supplementary review-ready evidence: its suite exits 0 and the established outer runner exits 2.
  It is **not** a fresh 21/21 full-suite run or a hosted-CI pass. The exact selection, hashes and validated result
  remain in the local delivery folder `deliverables/hu-ven-19-completion/` of the verification workspace.

Earlier evidence was retained: the first real attempt failed in the independent PDF reader's teardown
(`PDFDocumentProxy.destroy` is absent in this pdf.js version; destruction belongs to its loading task).
The second attempt exposed that raw PDF text order interleaves numeric cells inside wrapped product names;
the reader was corrected to compare complete names from the description column identified by its header.
Attempts 3/4 then exposed the real 20-product failure; instrumented capture recorded HTTP 429 on product,
customer and category reads. The bounded, cancellation-aware GET retry policy above was implemented after
its behavioral RED regressions, without changing Gateway limits. All four failed attempts were retained
and are not counted as acceptance. One default-parallel unit attempt timed out
in an existing navigation test while the stack acceptance was active; the final complete run above was
performed separately with one worker and unchanged test timeouts. The final candidate includes all runtime
fixes; any later commit that only records these results must retain identical application/deployment sources.

Attempt 5 successfully exported the 20-product sale with a 3-page PDF and valid XML after the retry fix,
then failed a later authorization navigation assertion while another429 was observed. That failed run
is retained too, not counted as acceptance. For the final run, only fixture/independent-readback traffic
was paced at 100 ms per request to stay below the Gateway budget; application traffic and Gateway settings
were unchanged. The browser must now observe the actual foreign-sale 403 before the original redirect check.
The final evidence validator also rejected 13 independent tamper cases (root, lock, pins, exit/status,
cleanup, missing/duplicate checks, documents, hashes, export and false full-acceptance claims).

Current real-fixture previews replace the existing active/multipage samples and XML in examples/sale-document;
pdf-unavailable-records.png shows the owner-approved references-only policy. The retained pdf-voided.png is
an earlier synthetic renderer example, not a real annulled-sale API download.

Limits remain explicit: the selected Sales API hides annulled sales with 404, so the ANULADA renderer is covered
by unit tests rather than claimed as a real annulled-sale download. Customer/product descriptions are current
when available, not historical snapshots. The supplied logo asset and Latin font coverage are unchanged.
No fiscal validation, electronic invoice integration, promotion, issue closure or synkro-docs update is included.

## HU-VEN-20: commercial number and issuer data

* **Schema 1.2** ([`schemas/sale-document-1.2.xsd`](schemas/sale-document-1.2.xsd), namespace
  `urn:synkro:sales:sale-document:1.2`) adds the optional `<commercialNumber>` (`VEN-YYYY-NNNNNN`) right after
  `<saleId>`. It is the commercial reference assigned by the Sales service, not a fiscal consecutive: it can have gaps and
  carries no tax validity. A sale stored without a number is exported without the element; the browser never makes one up.
  The 1.0 and 1.1 schemas stay in the repository.
* The PDF title, the continuation header and the footer use the commercial number when the sale has one; the full
  `saleId` stays in the footer as the internal reference. Without a number the title falls back to the `saleId`.
* Issuer: `VITE_ISSUER_*` are compiled into the image. The compose defaults use `:-`, so an empty variable can no longer blank the
  confirmed legal name or NIT. Changing a value requires rebuilding the image; editing `.env` alone does not change
  documents already served. The phone number was confirmed by the owner on 2026-11-08 as SynkroTech's number.
* The history shows the customer's **current** name and document (Customers is the source; there is no snapshot of
  the sale date), reading each distinct customer once with at most four requests in flight. A customer that cannot be
  read is shown as "Datos del cliente no disponibles".
