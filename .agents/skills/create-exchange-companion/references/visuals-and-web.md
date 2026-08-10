# Visual and website production

## Default visual system

Use a hand-drawn European travel scrapbook: cream paper, terracotta, lake blue, sage, warm yellow, dark ink outlines, offset paper shadows, stamps, tickets, tape, route lines, and restrained imperfections. Keep forms and dense task content clean.

Do not imitate a specific living artist or copy another product's assets. References may guide broad traits such as bold blocks, notebook tactility, or imperfect ink lines.

## Destination artwork

Create at least:

1. a route-and-luggage hero for the home and host locations;
2. a social preview image;
3. optional administrative, housing, campus-life, and arrival spot illustrations.

Prompt for original hand-drawn ink, flat warm color, slight print misregistration, subtle paper texture, transparent background when useful, no embedded text, and safe empty space for responsive cropping. Save optimized public assets under `public/images/` and update `config/exchange-profile.json`.

## UI rules

- Use handwriting only for headings and short annotations.
- Keep real controls recognizable; decorative illustrations cannot replace close, edit, delete, or accessibility-critical symbols.
- Keep decoration outside primary reading and click areas.
- Support `prefers-reduced-motion`.
- Avoid long loaders, infinite marquees, scramble text, glitch, flashing, and persistent floating motion.
- Ensure empty resource and travel states tell the user how AI or manual entry will populate them.

## Visual QA

Inspect at least `390x844`, `768x1024`, and `1440x900`. Check image cropping, bottom navigation, fixed emergency elements, touch targets, focus visibility, form overflow, table-to-card behavior, dialogs, and shared travel pages. An image is not accepted until the meaningful subject remains visible in all required crops.
