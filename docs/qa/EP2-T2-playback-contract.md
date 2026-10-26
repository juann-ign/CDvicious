# EP2-T2 — Playback state contract tests

**Status:** test-first baseline. This change adds tests and contract documentation only; it does not change playback production code.

## Test layers

### Deterministic coordinator contract

`tests/contracts/playback-snapshot-contract.test.mjs` describes the required semantics of a pure `createPlaybackSnapshotCoordinator` in `src/lib/playbackSnapshotCoordinator.ts`. This module does not exist yet, so these tests are intentionally red until the next implementation task adds the coordinator and connects it to Deck/Now Playing.

The coordinator seam is deliberately small and time-independent. Its state must expose:

- `confirmedSnapshot`: the most recently accepted, current player observation.
- `attempt`: the active playback attempt, its stable `id`, target album URI and terminal/pending status.
- Monotonic request ordering so a late response cannot overwrite a newer accepted snapshot.

Required methods are `getState()`, `beginAttempt({ attemptId, targetAlbumUri, startedAt })`, `markCommandAccepted(attemptId, at)`, `acceptSnapshot({ attemptId, requestSeq, requestStartedAt, receivedAt, snapshot })`, `observeSnapshot({ requestSeq, requestStartedAt, receivedAt, snapshot })`, `rejectAttempt(attemptId, reason, at)` and `expireAttempt(attemptId, at)`. The names define a test seam, not permission to bypass production validation at the API/store/Deck boundaries.

The coordinator must be pure: no timers, browser globals, fetch, React, or Spotify SDK. The caller supplies logical times and request sequence values. A command response alone remains pending; only a fresh target snapshot with `isPlaying: true` confirms. Pause and track-change observations update current player state without fabricating a playback attempt.

### Browser-level assertions

`tests/e2e/playback-state-contract.spec.cjs` checks initial load, pause/resume, Next/Previous, and recovery after a network failure. The existing STAB-03 suite continues to cover confirmation, authentication failure, unavailable device, failed Spotify response and request abort during the flying-disc flow.

These browser tests run only in the `RAIL_FLAG=1` matrix entry because the playback controls and flying-disc Deck layer belong to that desktop rail experience. `RAIL_FLAG=0` skips these specific UI tests intentionally; it does not turn off the deterministic coordinator contract suite.

## Required contract scenarios

| Scenario | Expected invariant |
|---|---|
| Initial load | Last valid observation appears; no invented pending attempt |
| API returns 200 | Attempt stays pending; old confirmed snapshot remains |
| Playback confirmation | Fresh, post-attempt snapshot matches target and has `isPlaying: true` |
| Pause | Track identity remains; `isPlaying` becomes false |
| Track change | New track is accepted without a fictitious album switch |
| Snapshot initiated before Play | Cannot confirm the new attempt even if it arrives late |
| Responses complete out of order | Older request sequence cannot overwrite a newer accepted snapshot |
| Overlapping attempts A then B | An event/snapshot from A cannot affect B or confirm B |
| Wrong target or target paused | Attempt remains pending |
| Authentication/device error | Attempt fails; previous confirmed snapshot is preserved |
| Network failure then retry | Failed attempt preserves previous state; a new attempt may confirm normally |
| Confirmation timeout | Attempt becomes degraded; a late event cannot revive it |

## Link to the prior regression

Issue [#88 — intermittent Deck/Now Playing mismatch](https://github.com/juann-ign/CDvicious/issues/88) is tracked by the active STAB-03 test `play confirmado desde Colección: vuelo, acople y Now Playing terminan sincronizados` in `tests/e2e/stab-03-modal-play-flight.spec.cjs`. That test was restored in merged PR [#94](https://github.com/juann-ign/CDvicious/pull/94) and is not permanently skipped: it is skipped only in the intentional `RAIL_FLAG=0` matrix run and executes in `RAIL_FLAG=1`. Keep `retries: 0`; do not weaken its assertion or let a retry hide a race.

## Run commands

- Pure contract tests: `npm run test:playback-contract`
- Browser suite: `playwright test` with the installed CI runner and `RAIL_FLAG=1`
- Build/TypeScript/lint: existing Build workflow.

## Expected test-first result

The browser tests exercise current observable mock-player behavior. The pure contract suite is expected to fail clearly while `src/lib/playbackSnapshotCoordinator.ts` is absent. Do not implement that module in this test-only change. The follow-on implementation task must satisfy the suite and connect the coordinator to the actual state source; a standalone implementation unused by Deck/Now Playing does not complete EP2-T2.
