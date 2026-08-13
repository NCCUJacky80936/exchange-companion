import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../app/components/ExchangeCompanion.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("ticket baggage rules are collapsible and archive after the exchange departure", () => {
  assert.match(component, /flight-allowance-disclosure/);
  assert.match(component, /open=\{!baggageEvaluation\.ready && !baggageIsPast\}/);
  assert.match(component, /state\.journey\.startDate < todayIso/);
  assert.match(component, /<h2>過去行李<\/h2>/);
  assert.ok(component.indexOf("<h2>過去行李</h2>") > component.indexOf("海關與航空限制要最後再確認一次"));
  assert.match(styles, /\.flight-allowance-disclosure\[open\] \.disclosure-chevron/);
});

test("exchange packing lives under the journey tabs and keeps legacy links compatible", () => {
  assert.match(component, /JourneyView/);
  assert.match(component, /準備進度/);
  assert.match(component, /出發行李/);
  assert.match(component, /params\.get\("section"\) === "packing"/);
  assert.match(component, /navigate\("journey", "packing"\)/);
  assert.doesNotMatch(component, /id: "packing", label: "行李工作台"/);
});

test("journey tabs keep a stable position before progress-only actions", () => {
  assert.ok(component.indexOf("journey-view-tabs") < component.indexOf("journey-progress-actions"));
  assert.match(component, /journey-progress-actions/);
  assert.match(styles, /\.journey-progress-actions/);
});

test("journey tabs and expandable paper sections transition without abrupt jumps", () => {
  assert.match(component, /className="journey-tab-slider"/);
  assert.match(component, /data-view=\{view\}/);
  assert.match(component, /key="journey-progress"/);
  assert.match(component, /key="journey-packing"/);
  assert.match(component, /useReducedMotion/);
  assert.match(styles, /\.journey-view-tabs\[data-view="packing"\] \.journey-tab-slider/);
  assert.match(styles, /transform: translateX\(100%\)/);
  assert.match(styles, /details::details-content/);
  assert.match(styles, /interpolate-size: allow-keywords/);
});

test("packing weight hierarchy shows the assigned total, subtotals, and unassigned warning", () => {
  assert.match(component, /weightBreakdown\.totalKg/);
  assert.match(component, /weightBreakdown\.checkedKg/);
  assert.match(component, /weightBreakdown\.carryOnKg/);
  assert.match(component, /weightBreakdown\.personalKg/);
  assert.match(component, /尚未計入上方已分配總重/);
  assert.match(component, /<span>托運箱內<\/span>/);
  assert.match(styles, /\.assigned-weight-summary dl/);
});
