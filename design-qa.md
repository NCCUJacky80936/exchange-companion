# Exchange Companion visual and interaction QA

- Source visual truth: Codex attachment `image-1.jpg`
- Desktop home: `output/design-qa/08-home-desktop-after.png`
- Desktop travel, collapsed / expanded: `output/design-qa/09-travel-collapsed-desktop-after.png`, `output/design-qa/10-travel-expanded-desktop-after.png`
- Desktop journey: `output/design-qa/11-journey-desktop-after.png`
- Tablet home: `output/design-qa/12-home-tablet-after.png`
- Mobile home: `output/design-qa/13-home-mobile-after.png`
- Mobile travel, collapsed / expanded: `output/design-qa/14-travel-collapsed-mobile-after.png`, `output/design-qa/15-travel-expanded-mobile-after.png`
- Comparison input: the source visual and desktop implementation were inspected together in one visual comparison pass.
- State: production build with an isolated local preview account and one temporary Prague trip. No production records were changed.

## Capture normalization

- Desktop viewport: `1440 × 900`; captured content width `1425px` after the browser scrollbar. Home screenshot is `1425 × 1209`.
- Tablet viewport: `768 × 1024`; captured content width `753px`. Home screenshot is `753 × 1647`.
- Mobile viewport: `390 × 844`; captured content width `375px`. Home screenshot is `375 × 1568`.
- All three responsive checks measured document `scrollWidth === clientWidth`; no page-level horizontal overflow was found.
- The temporary viewport overrides were reset after the captures.

## Visual fidelity

- Palette: the implementation uses the reference's warm cream surface, near-black type, and vivid soft yellow, pink, mint, and blue. Color is assigned by function rather than applied uniformly: blue for the current route / navigation, yellow for calendar and primary attention, pink for alerts and focus arrival, and mint for safe / supporting states.
- Typography: primary text stays dark enough to lead the composition; secondary copy remains quieter without falling below the visual weight of the illustrations.
- Illustrations: the hero and six navigation / empty-state illustrations are transparent PNG assets made from simple filled objects. They have no card frame, icon container border, or decorative outline around the illustration slot.
- Layout: all existing navigation positions, information hierarchy, card boundaries, and functional groupings remain in place. The requested calendar replaces only the prior four-week agenda surface.
- Line hierarchy: structural containers use solid borders; helper, editable, and secondary detail regions use dashed separators.

## Interaction verification

- The home milestone navigated to the exact task URL and the target task displayed the `attention-arrive` plus `attention-ring` animation.
- A new trip remained collapsed after creation. Opening it revealed the complete handbook; closing / opening retained the vertical accordion structure at desktop and mobile widths.
- The completed first journey task moved below the two incomplete tasks in the same phase.
- The month calendar rendered trip dots on September 4 and 6 and exposed an interactive date control for the trip range.
- Journey, trip-section, and day tabs retained visible pressed feedback. Reduced-motion styles disable the arrival animation when requested by the OS.
- The guest editor prompt contains a 30-second timer and a compact re-open control.

## Comparison history

### Pass 1 — findings

- `[P1]` Previous imagery was too detailed and visually weak beside the type.
- `[P1]` The four-week agenda did not match the requested monthly planning model.
- `[P2]` Travel opened a trip by default and completed journey tasks retained equal priority.
- `[P2]` Home notices landed at a section rather than the exact task or trip conflict.

### Pass 2 — fixes

- Replaced all visible illustrative roles with borderless, flat-object PNGs and raised palette saturation while preserving the existing frame system.
- Added an equal-rhythm monthly calendar with event dots and hover / tap detail behavior.
- Defaulted every trip to collapsed, added scroll-aware accordion motion, and pushed completed journey items down.
- Added exact task / trip targets with spring arrival and highlighted outlines.

### Pass 3 — passed

- Desktop, tablet, and mobile measurements showed no document overflow.
- Collapsed / expanded travel states, completed-task ordering, precise home navigation, and calendar dates were verified in the rendered application.
- `npm run check` passed all 90 tests; the public-cloud production build verifier also passed.
- No remaining P0, P1, or P2 visual or interaction findings.

final result: passed
