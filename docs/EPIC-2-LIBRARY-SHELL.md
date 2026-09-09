# EPIC 2 — CD Library & Physical Playback

## Direction

CDvicious keeps the full Spotify collection as an archive/disc-library while presenting a smaller curated shelf as the cinematic interaction surface.

The home experience should evolve from a standalone 100vh player into a physical media environment:

- Collection: hundreds of albums remain accessible as the archive.
- Shelf: roughly 12–20 albums become the focused 3D exhibition layer.
- Player: the selected disc becomes the active playback object.
- Transition: selecting a CD can animate the case opening, disc extraction, travel to the central player and playback.

## Epic sequencing

### 2.1 — Library shell
- Remove the assumption that the crate page must render the entire collection as full jewel cases.
- Establish a reusable collection/shelf data boundary.
- Prepare the home page to expose the crate as part of the same physical environment.

### 2.2 — Curated shelf
- Introduce a dedicated `Shelf` / `ShelfItem` interaction model.
- Keep the cinematic surface bounded to ~12–20 items.
- Add perspective, depth, overlap, hover elevation and responsive behavior.

### 2.3 — Crate interaction
- Pointer-based drag across both items and empty stage space.
- Separate click from drag with a movement threshold.
- Add smooth drift and seamless wrapping.

### 2.4 — Playback transition
- Open jewel case.
- Extract disc.
- Animate temporary flying disc toward player.
- Reuse the existing `/?album=id` Spotify playback path.

### 2.5 — Discovery
- Search across album/artist.
- Spotify artist genre enrichment.
- Genre pills.
- Search + genre filtering uses AND semantics.

### 2.6 — Polish and validation
- Preserve CDvicious' retro hardware/VFD language.
- Add the futuristic depth/glass treatment only where it reinforces the physical metaphor.
- Validate loading, responsive behavior and Spotify regressions.

## Review cadence

One epic is implemented and reviewed before starting the next one. Each epic has its own branch and PR so visual feedback can be incorporated without mixing unrelated changes.
