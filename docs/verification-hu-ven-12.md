# HU-VEN-12 verification status

Updated 2026-10-18 (America/Bogota). Full functional acceptance and integration
into develop are **pending**, not implied by checked boxes on the story.

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

- Durable intent recovery consumes a **proposed** Host lifecycle contract. It is
  disabled on the current Host; see the proposal linked below.
- Duplicate `.notice` and `.noticeText` definitions were removed.
- Loading already had a `role="status"` announcement. The regression now checks
  that accessible status rather than only visible text.
- A hidden history screen stops saga polling. Navigation preserves the draft but
  makes pending tracking unresolved and requires explicit observation on return.
  Unmount aborts in-flight requests and timers.
- Uncertain/FAILED operations cannot be discarded to mint another intent.
- Navigation primitives still require real authenticated Host acceptance.
  Unit tests alone do not settle that integration finding.

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

The recovery fake exposes the proposed identifier/subscription. These are
contract tests, **not** real Auth/Workflow acceptance. Earlier browser images and
intercepted API checks are historical frontend evidence only.

Writes go exclusively through Workflow using `shell/apiClient`, with only
customerId and productId/quantity lines. History/detail retain Sales amounts and
frozen prices. Auxiliary metadata failures preserve the valid Sales record.

## Integration gates

The current Host exposes only `session.user()`. It cannot guarantee reload
recovery with cleanup on logout and a new login by the same person. Registration
is disabled when the proposed capabilities are absent; there is no fallback to
user/tab-only isolation. See [the proposal](session-recovery-proposal.md), including
required Host tests. No Host source or accepted ADR was changed here.

GitHub Actions run `39179793600` for increment 1 reports three failed jobs with
no executed steps. Its annotation states: "The job was not started because your
account is locked due to a billing issue." Local checks do not authorize
substitution for the green-CI rule. No bypass is used.

Real registration, stock change, one persisted sale, compensation, same-key
replay, reload recovery, Auth roles, ownership and degraded metadata must be
tested against compatible real participants after the Host contract is available.
Dependencies moved since the historical implementation: an old Customers 501
claim is not the current blocker. Approved tags or explicit unpromoted SHAs must
be recorded for the eventual acceptance stack.

The story stays open. No qa/main promotion or tag is part of this delivery.
