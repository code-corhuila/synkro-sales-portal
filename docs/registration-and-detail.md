# Registration and detail

Detailed procedures and delivery notes moved from the repository README at
[source 1d696bd](https://github.com/code-corhuila/synkro-sales-portal/blob/1d696bdb97ebac08663153eb6712954d29774516/README.md).
Recorded execution results retain their original scope; moving them does not
constitute a new execution or certify a different revision.

Run commands from the repository root unless a step explicitly changes directory.

## Registration and composed detail

This delivery extends /sales without a separate registration route and adds /sales/{id}; source reference: code-corhuila/synkro-docs#246. Original contract versions were Workflow/Sales 2.1.0, Customers 2.0.0 and the Products contract on docs/main.

Current customer lookup uses POST /api/v1/customers/search with an ACTIVE query and explicit selection of bounded suggestions. The original registration phase used GET /api/v1/customers?identityDocument=; that historical description is superseded by the current Customers-search client and its Pact. Products are queried by name/active/limit. No whole catalog is preloaded. The cart has 1–100 lines, positive integer quantities and one line per product; validation is field-associated and prevents invalid backend calls. The integer catalog-price estimate is explicitly referential, not authoritative.

Registration sends only POST /api/v1/sagas/register-sale with {customerId, lines:[{productId,quantity}]} and GET /api/v1/sagas/{id} through shell/apiClient. It never sends createdBy, prices, subtotals, totals, saleId or SERVICE credentials; the browser does not POST a sale directly.

Each customer/product/quantity intent gets one crypto.randomUUID key independent of line order. A network/timeout/5xx failure retains the same request/key for manual retry; there is no automatic retry. Changing the customer, product or quantity creates a new intent/key. Once a saga is known, the portal observes it instead of posting again. COMPENSATED closes that intent; another submission is a new intent.

RUNNING uses bounded polling at 1, 2, 3 then 5 seconds up to 120 seconds and cancels on unmount/replacement. COMPLETED requires saleId, confirms registration, reads the authoritative total from Sales, reloads history page 1 and clears the form. COMPENSATED shows the approved localized step message and retains the form. FAILED is an attention state with the saga id; it does not assert rollback or invite an unverified new sale. Timeout/lost lookup leaves the saga unresolved with an explicit status-query action.

Detail first reads the authoritative sale, then one customer and one Products request per distinct product with concurrency at most 4. Missing related records show their stored id plus an explicit retry-information notice; amounts remain the historical Sales amounts. A 404 shows sale-not-found; 403 replaces the history entry with /sales and a localized notice; other failures offer manual retry.

src/navigation.ts uses the Products pushState/popstate pattern. /sales and /sales/{id} belong to the same /sales/* Host route, so App subscribes to popstate itself. The 403 notice travels in history state, not URL or persistent storage.

Original verification/contract gaps: [registration/detail evidence](verification-hu-ven-12.md). Visual evidence: [parity](visual-parity.md). Those recorded results retain their original scope and are not rerun by this documentation change.
