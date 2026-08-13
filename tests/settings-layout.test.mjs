import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const component = await readFile(new URL("../app/components/ExchangeCompanion.tsx", import.meta.url), "utf8");

test("settings page and cards remain shrinkable inside the viewport", () => {
  assert.match(component, /className="page-stack settings-page"/);
  assert.match(css, /\.settings-page\s*\{[^}]*width:\s*min\(1120px,\s*100%\)[^}]*min-width:\s*0/);
  assert.match(css, /\.settings-page\s*>\s*\*[^}]*min-width:\s*0[^}]*max-width:\s*100%/);
  assert.match(css, /\.settings-card\s*\{[^}]*min-width:\s*0/);
});

test("settings switches to a single column before the sidebar makes it cramped", () => {
  const tabletRules = css.slice(css.indexOf("@media (max-width: 1120px)"), css.indexOf("@media (max-width: 820px)"));
  assert.match(tabletRules, /\.settings-grid,\s*\.personalization-layout\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(tabletRules, /\.budget-row-main\s*\{\s*grid-template-columns:\s*auto minmax\(0,\s*1fr\)/);
});
