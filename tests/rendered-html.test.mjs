import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const profile = JSON.parse(await readFile(new URL("../config/exchange-profile.json", import.meta.url), "utf8"));

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("https://exchange-companion.example/", { headers: { accept: "text/html", "x-forwarded-host": "exchange-companion.example", "x-forwarded-proto": "https" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the exchange companion shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Exchange Companion 交換手帳｜交換學生行前規劃工具<\/title>/i);
  assert.match(html, /property="og:image" content="https:\/\/exchange-companion\.example\/og\.png"/i);
  assert.match(html, new RegExp(profile.appName));
  assert.match(html, /Exchange student &amp; study abroad planner/i);
  assert.match(html, /智慧資源庫/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /WebApplication/);
  assert.match(html, /initial-loading-shell/);
  assert.match(html, /loading-brand/);
  assert.match(html, /正在打開你的交換手帳/);
  assert.match(html, /我的交換|正在打開/);
  assert.doesNotMatch(html, /Repository Student|Personal Buddy|Private Coordinator/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships crawler metadata and browser security headers", async () => {
  const response = await render();
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.doesNotMatch(response.headers.get("content-security-policy") ?? "", /unsafe-eval/);
  assert.match(response.headers.get("strict-transport-security") ?? "", /max-age=31536000/);
  const html = await response.text();
  assert.match(html, /rel="canonical" href="https:\/\/exchange-companion\.example"/i);
  assert.doesNotMatch(html, /noindex/i);
});

test("keeps private parent files outside the app bundle", async () => {
  const [page, entry, component, defaultData, travelPlanner, travelPanels, cloudHook, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/AppEntry.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ExchangeCompanion.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/default-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/TravelPlanner.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/TravelTripPanels.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/useExchangeCloud.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /AppEntry/);
  assert.match(entry, /import\("\.\/ExchangeCompanion"\)/);
  assert.match(component, /localStorage|loadState/);
  assert.match(component, /downloadIcs/);
  assert.match(component, /交給 AI 辨識的網址/);
  assert.doesNotMatch(component, /packingInspiration|預載的行李品項靈感|inspiration-links/);
  assert.match(component, /TravelPlanner/);
  assert.match(travelPlanner, /Exchange-aware check/);
  assert.match(travelPlanner, /repeatWeekly/);
  assert.match(travelPlanner, /Google Maps 分享連結/);
  assert.match(travelPanels, /mapsUrlForActivity/);
  assert.match(travelPanels, /TravelNotesPanel/);
  assert.match(cloudHook, /網站目前無法啟用雲端登入/);
  assert.doesNotMatch(cloudHook, /本機尚未連接雲端/);
  assert.match(travelPanels, /TravelPackingPanel/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(`${component}\n${travelPlanner}\n${travelPanels}`, /credentials\.json|private_token|passport-scan|private-room-number/i);
  assert.doesNotMatch(defaultData, /Repository Student|Personal Buddy|Private Coordinator|country-specific-visa-portal|personal-journey-id/i);
  assert.doesNotMatch(defaultData, /EVA|Turkish|2\s*[×x]\s*23|40kg/i);
});
