# Resource page design QA

- Source visual truth: `output/design-qa/source-reference.png`
- Primary implementation capture: `output/design-qa/resources-after-1440.png`
- Narrow implementation capture: `output/design-qa/resources-after-narrow.png`
- Expanded resource capture: `output/design-qa/resources-card-details-1440.png`
- Combined comparison: `output/design-qa/resources-comparison.png`
- State: local-only resource page; no cloud account; resource summary/detail interaction verified with a temporary record and removed afterward.

## Capture normalization

- Source pixels: `2556 × 1648`; retina-style desktop capture.
- Primary implementation pixels: `1425 × 891`; browser CSS viewport measured `1440 × 900` with no horizontal overflow.
- Narrow implementation CSS viewport: `883 × 863`, with no horizontal overflow.
- Combined comparison normalized each image to `900px` width and padded to the same `620px` height. The source crop omits its sidebar while the implementation retains it, so the comparison judges the resource content frame rather than sidebar proportions.

## Full-view comparison evidence

- The original screenshot placed **手動新增資源** inside the copy column, below the description, leaving it visually detached from both the title and the research stamp.
- The revised desktop view places the button and research stamp in one right-side action group. Their centers and spacing share one visual row and the description remains unobstructed.
- At the narrower captured layout, the copy becomes its own row and the button/stamp action group spans the header below it, aligned to the content edges.

## Focused region evidence

- Header: button bounds at the desktop check were `x 1047.9, y 205.8, 150 × 44.3`; the action group remained within the header and no longer interrupted the description.
- Resource card: a temporary manual resource displayed a persistent summary block, an expandable detail control, preserved line breaks, source metadata, and a source link. Opening details succeeded, and the temporary resource was removed after capture.
- Packing page: `0` YouTube links and `0` inspiration panels were visible; the existing `11` ordinary packing rows remained.
- Console: the final resource-page browser check returned no errors or warnings.

## Required fidelity surfaces

- Fonts and typography: existing WenKai/Caveat/Noto hierarchy is preserved. New summary labels use the existing compact UI weight and detailed copy uses the readable body face.
- Spacing and layout rhythm: the header action is now part of an explicit tools group; wide and narrow layouts keep consistent content edges and no horizontal overflow.
- Colors and visual tokens: the original cream paper, ink, blue accent, terracotta offset shadow, and sage/yellow source states are unchanged.
- Image quality and assets: no illustrations or doodle assets were replaced, stretched, or cropped by this change.
- Copy and content: the header now promises summary plus applicability/steps. Resource cards separate summary from optional detail, while experience-video promotion is absent from the UI.

## Comparison history

### Pass 1 — blocked

- `[P2]` Header action was visually detached from the page action area and overlapped the reading flow at narrower desktop widths.
- Fix: moved the button into `resources-header-tools` alongside the research stamp and added a dedicated stacked layout below `1120px`.

### Pass 2 — passed

- Desktop and narrow captures show the button aligned within the header action group, the description unobstructed, and zero horizontal overflow.
- Summary/detail interaction and hidden-video behavior passed the focused checks.
- No remaining P0, P1, or P2 findings.

## Follow-up polish

- P3: once real AI-researched resources are imported, review summary length distribution and consider clamping unusually long summaries to keep paired cards visually balanced.

final result: passed
