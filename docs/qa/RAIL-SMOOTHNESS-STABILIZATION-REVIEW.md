# Rail smoothness stabilization — review findings

## Scope decision

Keep the existing PR #91 focused on EPIC 2.4 (playback transition) and EPIC 2.6.1 (navigation ergonomics). The full VFD hardware composition remains a separate EPIC 2.6.2 follow-up.

## Review findings before merge

- The current long-navigation E2E assertion observes only the data-chapter index; it does not measure actual scroll/visual progress, so it can pass even if intermediate chapters are not visibly traversed for a perceptible duration.
- Wheel gesture anchoring and Lenis targetScroll are sensitive to interrupting a running snap. Verify the interaction in browser QA before merge; the connector does not expose a local browser runtime.
- No published CI status checks were returned when this review was performed. Do not merge until Build and Browser QA are actually green.
- Manual review is still required at 761, 900, 1280 and 1920 px, with wheel and trackpad, modal locks, reduced motion, and play launched from both Batea and Collection.

## Implemented by PR #91

- Distance-scaled eased chapter navigation.
- Wheel snap triggered from gesture intent and one-chapter-per-gesture behavior.
- Right-side chapter rail to clear the VFD.
- Increased VFD width/typography (not a full redesign).
- Time-based 4.6 s flying-disc animation with deterministic rotation.
- E2E coverage for navigation, menu placement and confirmed playback flow.

## Merge gate

Before merging: run Build and browser E2E on the PR head; verify wheel interruption and scroll distance in a real browser; run the manual checks above. Keep retries at zero.
