# HU-VEN-12 verification status

Updated 2026-10-22 (America/Bogota). The 2026-10-22 section below is the current
state; the sections after it are the 2026-10-18 record and are kept as history.
Acceptance of the portal candidate has real-service evidence; remote CI and
full-platform acceptance remain pending. Checked story boxes are not used as
evidence.

## Current state (2026-10-22)

Candidate: develop `801d47689eb02c96c70d738752b959a48a1176b6` (tree
`dc3aac6f213a5817ceb12740e8009c730e7208f3`). Front `v2.0.0`
(`c43d024790cfc6345ddd266c04e6967a8d035702`) integrates the session contract that
this document earlier called an unintegrated candidate.

New local verification on a clean checkout of that SHA with Node 22.23.3: `npm ci`,
`npm run lint`, `npm run build`, `npm run test -- --coverage` (242 tests;
statements 96.43%, branches 94.64%, functions 99.48%, lines 99.49%) and
`npm run check:compiled`; also builds with base `/` and `/remotes/sales/`, the two
Python deployment tests, both container images and `nginx -t`. The repository has
no `check` script; `check:compiled` is the compiled-remote check used by CI.

New real-service run: the portal artifact built from that tree with
`VITE_BASE_PATH=/remotes/sales/` and the Host entry as build input, behind Front
`v2.0.0` and the `v2.0.0` tags of Auth API `e3ea374`, Auth DB `6c82703`, Auth
Portal `15f7334`, Gateway `5e5c3d5`, Customers API `28caff4`, Customers DB
`4c24733`, Customers Portal `4208839`, Products API `8c04934`, Products DB
`043e485`, Products Portal `b407475`, Sales API `f163eb6`, Sales DB `344d917` and
Workflow `09a1938`. Images were built from clean checkouts of those tags in
disposable resources (PostgreSQL and Mongo on tmpfs, new keys and credentials,
Auth-issued users and Workflow SERVICE credential; no dev sign-in). The Sales DB
migration runner image is reused tooling; its changelog came from the tag checkout.
Worker was not part of the run.

One browser run passed 18 of 18 scenarios. Unintercepted real transactions:
SALESPERSON login, registration, history and composed detail; deep link,
Back/Forward and reload; ADMIN registration; INVENTORY denied before the remote
loads; ownership 403 with redirect; insufficient stock rejected by Products;
compensation after a reservation (a valid boundary fixture makes Sales reject the
subtotal; the reservation ended RELEASED and no sale or stock change remained);
logout, same-person new login and ADMIN session replacement, none of which
recovered the previous owner's intent. Controlled faults against real
participants: a pause of Products during a saga (reload shows an explicit status
query and sends no POST); response loss after Workflow accepted the POST (reload
sends no POST; the explicit retry reuses the same idempotency key and yields one
sale); stopped Customers and Products (the sale stays visible with an
incomplete-data notice and recovers on retry); stopped Sales portal container (the
shell and Customers stay usable). Independent database reads afterwards: 6 sales,
8 sagas with 8 distinct idempotency keys (6 COMPLETED, 2 COMPENSATED), stock 100
to 88 for the normal product, reservations 6 RESERVED and 1 RELEASED. Retries did
not duplicate a sale.

Observation outside this repository: after the stopped Sales portal came back,
the Host's "Reintentar módulo" button did not request the React remote again; a
full page reload recovered it. Neither the Host nor the portal was changed.

The Workflow retention probe (controlled 48 hours, before and after a JVM restart)
below was run on `b3ecbe6` and was not repeated. `09a1938` differs from `b3ecbe6`
by zero files, so the source is equivalent. The local 24-hour deadline remains a
conservative limit; this is not an indefinite operational retention guarantee.

Remote CI: the 2026-10-22 re-run of run `39190333516` (attempt 2) again failed its
three jobs with no executed steps and the annotation "The job was not started
because your account is locked due to a billing issue." It is not a green CI and
local results do not replace it.

## History: 2026-10-18 record

## Candidate and review

PR #4 originally used `c89448c04f5351b1ab8bc1ddf3f01b0529366311` over develop
`d88babf9cd5a95bd7fb6cbae3a0db642c8df285f`. Its automated approval recorded
unresolved findings; it was not proof that those findings were fixed.
Original commits, including TDD, are preserved without rewriting history.

The candidate is split into lookups, form, saga contracts/navigation primitives,
detail, session recovery and final registration composition. Each increment is
below 400 changed production lines, including CSS/build scripts and excluding
tests. Detail precedes recovery so its review is independent of the proposed Host
contract. Only merge commits may integrate the increments into develop.

Findings addressed:

- Durable intent recovery consumes the lifecycle contract implemented in Front
  candidate `49eb6d1`. It remains disabled on older Hosts without those capabilities.
- Duplicate `.notice` and `.noticeText` definitions were removed.
- Loading already had a `role="status"` announcement. The regression now checks
  that accessible status rather than only visible text.
- A hidden history screen stops saga polling. Navigation preserves the draft but
  makes pending tracking unresolved and requires explicit observation on return.
  Unmount aborts in-flight requests and timers.
- Uncertain/FAILED operations cannot be discarded to mint another intent.
- Authenticated detail, deep links, reload and Back/Forward now passed against
  the exact Front candidate and real Auth/Sales services.

## Local verification

Clean git-archive snapshots were checked using Node 22.23.3 and the versioned
lockfile. The executable candidate at
`30f49d22d3da3df10182a9a699acec5543287734` passed lint, TypeScript/Vite build,
242 tests, and the compiled remote check. Coverage: statements 96.43%, branches
94.64%, functions 99.48%, lines 99.49%. Each increment was checked separately on
its exact SHA. The preceding complete candidate passed both `/` and
`/remotes/sales/` base builds and compiled checks; subsequent navigation changes
have an additional regression. Documentation-only updates do not change that
executable tree.

Contract fakes remain distinct from real integration evidence. Front's external
delivery (PR #41, verification comment 6257672318) provides 12 browser scenarios
on immutable Sales `7794cbf`, including real login, registration, reload, explicit
same-key replay, logout/session replacement and INVENTORY rejection. Its sources,
dependency archives and image IDs were verified before reuse; it is not Front
#36's head. The three Front candidate trees are identical but unintegrated.

The portal's complementary run used its own freshly migrated PostgreSQL/Mongo,
network, secrets and containers with the same immutable images. Seven scenarios
passed: SALESPERSON registration/history/composed detail; authenticated detail
deep link/Back/Forward/reload; unavailable Customers/Products metadata with intact
sale and recovery; ADMIN registration; insufficient stock; real Sales overflow
rejection after reservation followed by release; and foreign-sale 403/redirect.
Independent store reads ended with two sales and stock 96 from the initial 100.
The compensation fixture retained stock 2000 and its reservation was RELEASED.

Normal registrations, searches, ownership and navigation were uninterrupted real
transactions. Metadata outages deliberately stopped only the run's own services.
Compensation used a valid boundary-price/quantity fixture to elicit a real Sales
business rejection, not an intercepted response. Front's response-loss proxy and
Products pause are controlled transport scenarios against real participants;
proactive renewal/late-response/401/403 transport tests remain doubles.
Sanitized reports, provenance, database counts and reproducible harness are kept
outside Git. Historical intercepted screenshots do not establish business acceptance.

Writes go exclusively through Workflow using `shell/apiClient`, with only
customerId and productId/quantity lines. History/detail retain Sales amounts and
frozen prices. Auxiliary metadata failures preserve the valid Sales record.

## Integration gates

Front #41 head `49eb6d1a5ea1b27e561d854b76009e3a297ce019` implemented
`user()`, `sessionId()` and `subscribe()`; #42/#43 have the same executable tree.
(At the time of this record they were unintegrated; Front `v2.0.0` has since
released the contract.) The remaining delivery gates are actual CI and
deployment of the matching Host artifact. See [the contract verification](session-recovery-proposal.md).
No Host source or accepted ADR was changed here.

GitHub Actions run `39179793600` for increment 1 reports three failed jobs with
no executed steps. Its annotation states: "The job was not started because your
account is locked due to a billing issue." A fresh second attempt again failed
all three jobs before any step. Local checks do not authorize
substitution for the green-CI rule. No bypass is used.

Workflow candidate `b3ecbe6` uses a persistent unique key without an age cutoff,
expiry field or application deletion. An additional real HTTP/PostgreSQL probe
replayed four states at controlled age 48 hours before/after JVM restart: same
saga, four rows total, modified request 400, other caller 403, app DELETE denied.
Its signed identity/rows are test fixtures; this is not real Auth/business
acceptance, a 48-hour elapsed soak, or an indefinite operational retention SLA.
The exact implementation is compatible with the local 24-hour ceiling while
the store is retained. Neither Workflow nor the deadline changed.

Auth Portal v2.0.0 commit is `15f7334d33822aaace24ec25fa1a1097a43dbad0`;
`9eae08a` is its annotated tag object. The previous build archive and extracted
sources match that actual commit byte-for-byte; its old image revision label
used the tag object and must not be interpreted as a commit.

The story stays open. This document does not claim acceptance of the whole platform.
