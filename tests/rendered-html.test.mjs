import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  assert.match(html, /<title>交換手帳｜AI 優先的交換生旅程控制台<\/title>/i);
  assert.match(html, /property="og:image" content="https:\/\/exchange-companion\.example\/og\.png"/i);
  assert.match(html, /交換手帳/);
  assert.match(html, /我的交換|正在打開/);
  assert.doesNotMatch(html, /Austin|Florian Lampl|Manuel Hodrius/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps private parent files outside the app bundle", async () => {
  const [page, component, defaultData, travelPlanner, travelPanels, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ExchangeCompanion.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/default-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/TravelPlanner.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/TravelTripPanels.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /ExchangeCompanion/);
  assert.match(component, /localStorage|loadState/);
  assert.match(component, /downloadIcs/);
  assert.match(component, /TravelPlanner/);
  assert.match(travelPlanner, /Exchange-aware check/);
  assert.match(travelPlanner, /repeatWeekly/);
  assert.match(travelPlanner, /Google Maps 分享連結/);
  assert.match(travelPanels, /mapsUrlForActivity/);
  assert.match(travelPanels, /TravelNotesPanel/);
  assert.match(travelPanels, /TravelPackingPanel/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(`${component}\n${travelPlanner}\n${travelPanels}`, /credentials\.json|token_jacky|護照影本|Zimmer 5703/);
  assert.doesNotMatch(defaultData, /Austin|Florian Lampl|Manuel Hodrius|Auslandsportal|austin-hdm/i);
});
