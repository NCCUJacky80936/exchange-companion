import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../app/components/HomeDashboard.tsx", import.meta.url), "utf8");
const activation = await readFile(new URL("../app/components/HomeActivationGuide.tsx", import.meta.url), "utf8");
const starter = await readFile(new URL("../app/lib/concierge-starter.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const onboarding = await readFile(new URL("../app/components/OnboardingWizard.tsx", import.meta.url), "utf8");
const manifest = await readFile(new URL("../app/manifest.ts", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("daily home keeps the interactive month calendar, bulletin, journey, and budget in one control center", () => {
  for (const marker of ["HomeMonthCalendar", "home-calendar-dots", "交換佈告欄", "交換旅程", "基礎預算"]) assert.ok(dashboard.includes(marker));
  assert.match(dashboard, /section: "journey", task: nextTask\?\.id/);
  assert.match(dashboard, /<FloatingSurface[\s\S]*prefer="top"/);
  assert.match(dashboard, /onMouseEnter=\{\(event\) => \{ if \(!dayItems\.length\) return; cancelHoverClose\(\); activeAnchorRef\.current/);
  assert.match(dashboard, /onMouseLeave=\{scheduleHoverClose\}/);
  assert.match(dashboard, /current === date && hoverOpenedDateRef\.current !== date/);
  assert.match(dashboard, /home-calendar-date:not\(:disabled\)/);
  assert.match(dashboard, /home-calendar-popover-content/);
  assert.match(dashboard, /home-bulletin-empty/);
  assert.match(styles, /grid-template-areas:\s*"bulletin" "agenda"/);
  assert.match(styles, /\.home-bulletin-board\s*\{[^}]*overflow:\s*clip/);
  assert.match(styles, /clarity pass:[\s\S]*\.home-month-day\.active \.home-calendar-date\s*\{\s*background:\s*rgba\(32, 34, 32, 0\.065\)/);
  assert.match(styles, /\.home-bulletin-item:nth-child\(3n\)\s*\{\s*background:\s*rgba\(255, 254, 252, 0\.72\)\s*!important/);
});

test("activation copy separates public skill installation from the private connection file", () => {
  assert.ok(activation.includes("exchange-concierge-connection.json"));
  assert.ok(starter.includes("$skill-installer"));
  assert.ok(starter.includes(".agents/skills/exchange-concierge"));
  assert.ok(starter.includes(".agents/skills/exchange-email-intake"));
  assert.doesNotMatch(starter, /eyJ[a-zA-Z0-9_-]{12,}/);
  assert.doesNotMatch(starter, /[A-Z0-9._%+-]+@(gmail|outlook|yahoo)\.[A-Z]{2,}/i);
});

test("onboarding shifts return tasks from the exchange end date", () => {
  assert.match(onboarding, /task\.phase === "return" \? endOffset : offset/);
});

test("installed app uses dedicated Android and Apple home-screen artwork", () => {
  assert.match(manifest, /exchange-192\.png/);
  assert.match(manifest, /exchange-512\.png/);
  assert.match(manifest, /purpose: "maskable"/);
  assert.match(layout, /apple-touch-icon\.png/);
});

test("mobile home completion count stays below the progress bar", () => {
  assert.doesNotMatch(styles, /\.home-status-progress small \{[^}]*margin-top:\s*-\d/);
});
