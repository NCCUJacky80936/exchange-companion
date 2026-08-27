import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page, entry, welcome, layout, styles] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/components/AppEntry.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/components/PublicWelcome.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("public first paint defers the private notebook bundle and cloud runtime", () => {
  assert.match(page, /<AppEntry \/>/);
  assert.doesNotMatch(page, /ExchangeCompanion/);
  assert.match(entry, /lazy\(loadExchangeCompanion\)/);
  assert.match(entry, /shouldResumePrivateNotebook/);
  assert.match(layout, /preload:\s*false/);
  assert.match(layout, /dataset\.privateNotebook/);
});

test("public artwork uses right-sized direct WebP assets", () => {
  assert.match(welcome, /exchange-hero-clean-720\.webp/);
  assert.match(welcome, /journey-route-160\.webp/);
  assert.match(welcome, /ai-spark-160\.webp/);
  assert.match(welcome, /travel-suitcase-160\.webp/);
  assert.match(welcome, /unoptimized/);
  assert.match(styles, /exchange-mark-96\.webp/);
});
