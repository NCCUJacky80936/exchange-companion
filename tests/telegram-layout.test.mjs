import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [ai, cloud, types, sync, webhook] = await Promise.all([
  readFile(new URL("../app/components/AiConcierge.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/lib/cloud.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/lib/types.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/exchange-concierge-sync/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/telegram-concierge-webhook/index.ts", import.meta.url), "utf8"),
]);

const telegramCard = ai.slice(
  ai.indexOf('<article className="paper-card ai-telegram-card">'),
  ai.indexOf('<section className={`ai-workflow-grid'),
);
const telegramTypes = types.slice(
  types.indexOf("export interface TelegramPairingInfo"),
  types.indexOf("export interface AiInbox"),
);

test("Telegram card is a pending-only intake and never claims it can apply notebook changes", () => {
  assert.match(telegramCard, /不用記指令/);
  assert.match(telegramCard, /待確認提案/);
  assert.match(telegramCard, /Telegram 不會直接修改手帳/);
  assert.doesNotMatch(telegramCard, /自動套用|直接套用|自動修改手帳/);
});

test("Telegram starts from a one-tap pairing link and keeps a persistent button menu", () => {
  assert.match(telegramCard, /產生安全配對連結/);
  assert.match(telegramCard, /打開 Telegram 並配對/);
  assert.match(ai, /searchParams\.set\("start", pairingCode\)/);
  assert.match(sync, /searchParams\.set\("start", code\)/);
  assert.match(webhook, /is_persistent: true/);
  assert.match(webhook, /TELEGRAM_MENU_LABELS\.capture/);
  assert.match(webhook, /TELEGRAM_MENU_LABELS\.resources/);
  assert.match(webhook, /TELEGRAM_MENU_LABELS\.recipe/);
});

test("Telegram pairing is scoped through an explicitly selected Concierge connection", () => {
  assert.match(telegramCard, /<select value=\{telegramConnectionId\}/);
  assert.match(telegramCard, /要授權的 Exchange Concierge 連線/);
  assert.match(telegramCard, /activeConnections\.map\(\(connection\)/);
  assert.match(telegramCard, /createTelegramPairingCode/);
  assert.match(cloud, /createTelegramPairing\(connectionId: string\)/);
  assert.match(cloud, /action: "telegram-pair", connectionId/);
});

test("Telegram revocation warns about raw-text deletion and stays bound to the selected connection", () => {
  assert.match(ai, /window\.confirm\("撤銷 Telegram 連結後，未處理的原文會立即清除，且無法復原/);
  assert.match(telegramCard, /disconnectTelegram/);
  assert.match(telegramCard, /撤銷 Telegram/);
  assert.match(cloud, /revokeTelegramLink\(connectionId: string\)/);
  assert.match(cloud, /action: "telegram-revoke", connectionId/);
});

test("browser-facing Telegram state contains no Telegram account IDs or bot token", () => {
  assert.doesNotMatch(telegramCard, /telegram(?:User|Chat)Id|telegram_(?:user|chat)_id|botToken|TELEGRAM_BOT_TOKEN/i);
  assert.doesNotMatch(telegramTypes, /telegram(?:User|Chat)Id|telegram_(?:user|chat)_id|\btoken\s*:/i);
  assert.match(telegramTypes, /connectionId: string/);
  assert.match(telegramTypes, /botUsername: string/);
});
