# Proposed Host session recovery contract

Status: **implemented and tested in an unintegrated Front candidate**:
`49eb6d1a5ea1b27e561d854b76009e3a297ce019`, Front PR #41. Candidates #42 and
#43 have the same tree `ce447aac7ec9bbed4422ada815014e497f9c9d3f`. These are not
integrated permanent-branch releases or tagged artifacts. This portal does not
change the Host or ratify a pending ADR. Registration is enabled by the candidate
capabilities and stays disabled on older Hosts lacking them. History/detail are
independent. Full-platform acceptance is not claimed.

## Host contract verified in candidate

Extend the existing federated `shell/session` object:

```ts
session.user(): { sub: string; role: string } | null
session.sessionId(): string | null
session.subscribe(listener: () => void): () => void
```

The Host generates an opaque, noncredential session identifier after a real Auth
login. It must not be a JWT, refresh token, token hash or SERVICE credential.
The identifier survives reload and token renewal within the same authenticated
session. A new login receives a different identifier, including for the same
person. It is null without an authenticated session. Only the Host owns its
creation, persistence, restoration and invalidation.

The Host must publish a consistent user/session snapshot before synchronously
notifying subscribers on logout or identity/session replacement. A token renewal
may notify but must retain the identifier. Unsubscribe is idempotent. Subscribers
must not perform authentication or create a second identity issuer. A remote
mounted after restoration reads the ready snapshot, never transient credentials.

Required Host acceptance tests (reported and evidenced by Front's candidate delivery): real Auth login;
reload and renewal retain the identifier; logout publishes null and notifies;
new login rotates it; another user's login changes both identity and session;
late responses from the previous session cannot restore it; protected 401 follows
the Host policy; 403 retains the session; logout while Sales is unmounted still
invalidates recovery. No JWT/SERVICE token is exposed by these two capabilities.

## Portal consumer and storage

`intentJournal.ts` owns a single `sessionStorage` entry,
`synkro.sales.intent.v1`. It stores the exact owner pair (subject, opaque session
identifier), idempotency key, canonical fingerprint, optional known saga UUID,
and retry deadline. The fingerprint contains only customer/product UUIDs and
quantities; it contains no customer document, name, address, prices or totals.
Tokens and other storage keys are never read. It is a tab-scoped recovery journal,
not an authoritative transaction record or cross-tab deduplication mechanism.

The journal is written before any POST. Reload/mount performs no POST and no
automatic status observation. A known saga restores an unresolved notice and an
explicit GET action. Without a saga identifier, the person must reconstruct the
same request to explicitly retry with the original key. Changing an uncertain
request cannot replace that key. Double submission is synchronously locked.

The retry deadline is 24 hours from the original submission and is not extended
by retries. Expiration blocks unknown-result POSTs and requires reconciliation;
it never silently deletes a key or authorizes a new sale. A known saga can still
be checked by GET. Workflow release candidate
`b3ecbe6c75f7038b9b8fe11d396bf00a642bb248` retains its unique
`(saga_type,idempotency_key)` row without an age predicate, expiry column or
application deletion operation. HTTP replays of controlled rows backdated 48 hours
returned the same four saga states before and after JVM restart, without inserting
another row. This verifies compatibility of that exact implementation with the
24-hour local ceiling while its store is retained; it is not 48 hours elapsed or
a documented indefinite operational retention SLA. Input/caller mismatch remains
rejected. Workflow and the local deadline were not changed.

If a future cleanup/restore policy cannot retain keys for the retry window, the
safe alternative is to disable unknown-result POST retries until authoritative
reconciliation (known sagas still use GET), or have Workflow's owner publish and
implement a compatible minimum retention. Neither alternative is silently adopted
as a new backend contract here.

COMPLETED with a saleId and COMPENSATED clear the journal. FAILED retains its
saga for attention; dismiss/clear cannot discard an uncertain or failed operation.
Definitive submission rejections without a saga release the intent. Storage read,
parse or write failures block registration rather than sending an unrecoverable
POST. Closing the tab loses tab storage; cloned tabs and storage deletion are
outside this guarantee and require backend reconciliation before resubmission.

The journal keeps a Host subscription while a pending record exists, including
after portal navigation/unmount. On logout or owner replacement it clears only
local references and aborts local observation. This **does not cancel, release
stock or compensate a backend saga**. Every asynchronous continuation checks its
original owner; late results cannot complete a replacement session's sale.

The optional declarations in `shell.d.ts` allow old Hosts to load history/detail
without crashing. They do not assert architectural ratification or promotion. No
fallback based solely on user/tab identity is enabled.

## Verification and integration gate

`registrationRecovery.test.tsx` uses a contract fake, not the real Host.
It covers same-key remount recovery, explicit GET, no automatic POST, uncertain
clear/change, late identity response, unavailable storage, expiration, new session
for the same person and notified logout. Existing tests cover double click,
timeouts, bounded polling, terminal states and navigation. `compiledRecovery`
checks keep arbitrary storage/credential access forbidden. Front's external
delivery additionally verifies the same Sales source `7794cbf` with real Auth,
Workflow and participants for reload, replay, logout and session replacement.
The portal's complementary real-service browser run covers composed detail,
authenticated history/deep links/Back/Forward, ownership, insufficient stock,
post-reservation compensation and unavailable auxiliary metadata. Transport
failures deliberately provoked in those runs are identified separately from
unintercepted business transactions. Provenance and reproducible harness are
retained in the external verification report.

ADR-006 leaves human identity and credentials with Auth/Host; ADR-007 makes the
persisted Workflow saga and its idempotent resource authoritative; ADR-010 leaves
historical prices and totals in Sales. This proposal adds a browser recovery
lifecycle that those decisions do not specify. Its implementation is now present
in the tested Front candidate; architectural documentation and permanent-branch
integration remain pending. Actual CI is still required for merging the portal.

Alternatives considered: user/tab-only storage cannot detect a new session for
the same person and was rejected for that guarantee; Host-owned durable intent
storage is a possible alternative with a larger API; a server-side intent lookup
would require a new backend contract. None is recorded as an accepted ADR here.
