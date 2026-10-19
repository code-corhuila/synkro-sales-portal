# HU-VEN-12 verification status

Updated 2026-10-18 (America/Bogota). Acceptance of the portal candidate now has
real-service evidence; permanent-branch integration and full-platform acceptance
remain pending. Checked story boxes are not used as evidence.

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

Front #41 head `49eb6d1a5ea1b27e561d854b76009e3a297ce019` implements
`user()`, `sessionId()` and `subscribe()`. #42/#43 have the same executable tree.
The contract is available for candidate acceptance; it is not yet integrated in
Front's permanent branches or tagged. The remaining delivery gates are actual
CI and integration/deployment of the matching Host artifact, not absence of an
implementation. See [the contract verification](session-recovery-proposal.md).
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

The story stays open. No qa/main promotion or tag is part of this delivery.
