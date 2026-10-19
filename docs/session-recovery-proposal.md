# Proposed Host session recovery contract

Status: **PROPOSED, not approved or implemented by synkro-front**. This portal
does not change the Host. Registration is disabled with an explicit Spanish
message when the required capabilities are unavailable. History and detail
remain independent. This is not acceptance of HU-VEN-12 or the platform.

## Required Host change

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

Required Host acceptance tests (pending in that repository): real Auth login;
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
be checked by GET. Backend idempotency retention must be confirmed before approval;
this local deadline is not a claim about Workflow retention guarantees.

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
without crashing. They do not assert that the proposal has been approved. No
fallback based solely on user/tab identity is enabled.

## Verification and integration gate

`registrationRecovery.test.tsx` uses a proposed-contract fake, not the real Host.
It covers same-key remount recovery, explicit GET, no automatic POST, uncertain
clear/change, late identity response, unavailable storage, expiration, new session
for the same person and notified logout. Existing tests cover double click,
timeouts, bounded polling, terminal states and navigation. `compiledRecovery`
checks keep arbitrary storage/credential access forbidden.

ADR-006 leaves human identity and credentials with Auth/Host; ADR-007 makes the
persisted Workflow saga and its idempotent resource authoritative; ADR-010 leaves
historical prices and totals in Sales. This proposal adds a browser recovery
lifecycle that those decisions do not specify. It requires architectural review
and an implemented Host contract before claiming real registration integration.

Alternatives considered: user/tab-only storage cannot detect a new session for
the same person and was rejected for that guarantee; Host-owned durable intent
storage is a possible alternative with a larger API; a server-side intent lookup
would require a new backend contract. None is recorded as an accepted ADR here.
