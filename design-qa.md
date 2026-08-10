# Design QA — V2 travel maps, notes, and packing

## Comparison target

- Source visual truth: local rendering of [NCCUJacky80936/Italy_Trip](https://github.com/NCCUJacky80936/Italy_Trip), captured from `http://127.0.0.1:4311/`.
- Implementation: Exchange Companion V2 at `http://localhost:3000/`.
- Viewport and density: both source and implementation captured at a 1440 × 900 CSS viewport; both PNG files are 1440 × 900 pixels, so no density normalization was required.
- Compared states:
  - Daily itinerary with per-stop Google Maps actions.
  - Trip-specific packing checklist with categories and checked state.
- Full-view evidence:
  - `design-qa-assets/italy-trip-map-source-1440x900.png`
  - `design-qa-assets/exchange-companion-map-1440x900.png`
  - `design-qa-assets/italy-trip-packing-source-1440x900.png`
  - `design-qa-assets/exchange-companion-packing-1440x900.png`
- Focused comparison: the full viewport kept the map actions, route panel, tab structure, packing categories, progress, and row controls legible, so a smaller crop was not needed.

## Findings

- No actionable P0, P1, or P2 differences remain.
- The source uses a neutral Tailwind travel-guide visual system; the implementation intentionally retains Exchange Companion's established paper, hand-drawn type, offset shadows, and AI doodle assets. This is expected product continuity rather than fidelity drift.
- The source exposes a Google Maps action beside each schedule row. The implementation preserves that affordance, adds a dedicated address/share-link field, and provides a grouped same-day route action without requiring a Maps API key.
- The source separates itinerary, luggage, and safety into tabs. The implementation keeps the same information architecture as “行程與地圖／注意事項／旅行行李,” with notes covering safety, booking, transport, food, shopping, and general reminders.

## Required fidelity surfaces

- Fonts and typography: existing `Noto Sans TC`, `LXGW WenKai TC`, and `Caveat` hierarchy remains consistent; compact map and checklist labels remain readable without replacing body copy with handwriting.
- Spacing and layout rhythm: three equal handbook tabs, categorized packing groups, map stop cards, and action forms align to the existing travel board. No horizontal overflow was found at 1440 × 900, 768 × 1024, or 390 × 844.
- Colors and visual tokens: map actions use the established lake-blue token; packing uses sage completion and cream-yellow grouping; important notes use the existing risk red.
- Image quality and assets: all non-standard visible illustrations reuse the project's original AI doodle PNG assets. No placeholders or code-drawn substitute illustrations were introduced.
- Copy and content: labels clearly distinguish address, Google Maps share link, generated search, route opening, trip-only packing, and the boundary from the main exchange luggage workspace.

## Interaction and accessibility checks

- Added, edited, checked, persisted, and deleted test records for map stops, notes, and trip packing.
- Verified custom Google Maps links and generated same-day Directions links.
- Verified older saved trips migrate to empty `travelNotes`, `packingItems`, and `mapsUrl` fields.
- Keyboard-visible labels, tab roles, selected states, external-link semantics, and 390 px touch layout were inspected.
- Browser console contained no errors.
- Temporary test trip was deleted; the user's existing Bangkok trip remained intact after reload.

## Comparison history

- Initial comparison found the intended visual difference between the Italy Trip guide and the Exchange Companion scrapbook system. No P0/P1/P2 issue required a visual correction.
- One functional polish issue was corrected during interaction testing: newly created trips now return to the “行程與地圖” tab instead of inheriting the previously selected handbook tab.

## Follow-up polish

- P3: a future geocoding service could show a true embedded map preview, but it would require an API/provider and explicit privacy/network decisions. The current link-and-route approach is complete without external credentials.

final result: passed
