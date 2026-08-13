import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [ai, resources, css] = await Promise.all([
  readFile(new URL("../app/components/AiConcierge.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/components/ExchangeCompanion.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("proposal inbox appears before connection and JSON cards", () => {
  assert.ok(ai.indexOf('className="proposal-section paper-card ai-inbox-details"') < ai.indexOf("ai-workflow-grid"));
  assert.match(css, /\.ai-workflow-grid\.has-connection\s*\{[^}]*align-items:\s*stretch/);
  assert.match(css, /\.ai-workflow-grid\.has-connection\s*>\s*article\s*\{[^}]*height:\s*100%/);
});

test("URL intake is collapsed by default and explains its retention", () => {
  assert.match(resources, /<details className="paper-card resource-intake-card">/);
  assert.doesNotMatch(resources, /<details className="paper-card resource-intake-card" open/);
  assert.match(resources, /已處理的紀錄會在 2 天後自動清除/);
  assert.match(css, /\.resource-intake-card\[open\]/);
});

test("AI updates use a pending-only notification ticket with a three-item preview", () => {
  assert.match(resources, /pendingProposalCount \? <div className="ai-notification-wrap"/);
  assert.match(resources, /latestPendingProposals[\s\S]*\.slice\(0, 3\)/);
  assert.match(resources, /查看全部更新/);
  assert.match(resources, /setAiNotificationOpen\(false\); setAiInboxOpenRequest/);
  assert.doesNotMatch(resources, /topbar-ai-button/);
  assert.match(css, /\.ai-notification-ticket/);
  assert.match(css, /\.ai-update-popover/);
});
