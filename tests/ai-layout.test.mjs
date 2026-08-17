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

test("AI page automatically polls the connected proposal inbox", () => {
  assert.match(ai, /setInterval\(\(\) => void refresh\(\), 60_000\)/);
  assert.match(ai, /visibilitychange/);
  assert.match(ai, /每週巡檢會整理信件與新文件/);
  assert.match(ai, /你在 Codex 新增狀態時則立即推送/);
  assert.match(ai, /對話中新狀態立即產生待審提案/);
});

test("manual resource entry and AI URL intake share one modal", () => {
  assert.doesNotMatch(resources, /<details className="paper-card resource-intake-card">/);
  assert.match(resources, /className="resource-modal-mode-switch"/);
  assert.match(resources, /手動填寫/);
  assert.match(resources, /AI 辨識網址/);
  assert.match(resources, /已處理的紀錄會在 2 天後自動清除/);
  assert.match(css, /\.resource-modal-mode-switch/);
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
