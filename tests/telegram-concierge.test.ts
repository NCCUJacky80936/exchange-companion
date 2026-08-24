import assert from "node:assert/strict";
import test from "node:test";

import {
  constantTimeEqual,
  normalizePairCode,
  parseTelegramCommand,
  parseTelegramUpdate,
  TELEGRAM_MAX_TEXT_CHARACTERS,
  telegramTextLength,
} from "../supabase/functions/_shared/telegram";

function privateUpdate(overrides: Record<string, unknown> = {}) {
  return {
    update_id: 101,
    message: {
      message_id: 202,
      from: { id: 303 },
      chat: { id: 303, type: "private" },
      text: "請幫我把車票加到旅行計畫",
      ...overrides,
    },
  };
}

test("compares Telegram webhook secrets without accepting prefixes or different byte lengths", () => {
  assert.equal(constantTimeEqual("secret-token_123", "secret-token_123"), true);
  assert.equal(constantTimeEqual("secret-token_123", "secret-token_124"), false);
  assert.equal(constantTimeEqual("secret-token_123", "secret-token_1234"), false);
  assert.equal(constantTimeEqual("密碼", "密碼"), true);
  assert.equal(constantTimeEqual("密碼", "密碼　"), false);
});

test("accepts a safe private text update and preserves reply correlation", () => {
  const parsed = parseTelegramUpdate(privateUpdate({ reply_to_message: { message_id: 99 } }));
  assert.equal(parsed.kind, "private-message");
  if (parsed.kind !== "private-message") return;
  assert.equal(parsed.updateId, 101);
  assert.equal(parsed.messageId, 202);
  assert.equal(parsed.userId, 303);
  assert.equal(parsed.chatId, 303);
  assert.equal(parsed.replyToMessageId, 99);
  assert.equal(parsed.text, "請幫我把車票加到旅行計畫");
  assert.equal(parsed.command, null);
});

test("silently ignores groups and updates without a message", () => {
  assert.deepEqual(parseTelegramUpdate({ update_id: 101 }), { kind: "ignore" });
  assert.deepEqual(parseTelegramUpdate(privateUpdate({ chat: { id: -303, type: "group" } })), { kind: "ignore" });
  assert.deepEqual(parseTelegramUpdate(privateUpdate({ chat: { id: -303, type: "supergroup" } })), { kind: "ignore" });
});

test("keeps private non-text messages distinguishable from invalid private messages", () => {
  const nonText = privateUpdate();
  delete (nonText.message as { text?: string }).text;
  const parsed = parseTelegramUpdate(nonText);
  assert.equal(parsed.kind, "private-message");
  if (parsed.kind === "private-message") assert.equal(parsed.text, null);

  assert.deepEqual(
    parseTelegramUpdate(privateUpdate({ from: { id: Number.MAX_SAFE_INTEGER + 1 } })),
    { kind: "invalid", reason: "invalid_private_message" },
  );
  assert.deepEqual(
    parseTelegramUpdate({ ...privateUpdate(), update_id: 1.5 }),
    { kind: "invalid", reason: "invalid_update_id" },
  );
  assert.deepEqual(
    parseTelegramUpdate(privateUpdate({ reply_to_message: { message_id: "99" } })),
    { kind: "invalid", reason: "invalid_private_message" },
  );
});

test("enforces Telegram text length by Unicode characters", () => {
  const exactLimit = "🧳".repeat(TELEGRAM_MAX_TEXT_CHARACTERS);
  assert.equal(telegramTextLength(exactLimit), TELEGRAM_MAX_TEXT_CHARACTERS);
  const accepted = parseTelegramUpdate(privateUpdate({ text: exactLimit }));
  assert.equal(accepted.kind, "private-message");

  assert.deepEqual(
    parseTelegramUpdate(privateUpdate({ text: `${exactLimit}x` })),
    { kind: "invalid", reason: "invalid_text" },
  );
  assert.deepEqual(
    parseTelegramUpdate(privateUpdate({ text: "   " })),
    { kind: "invalid", reason: "invalid_text" },
  );
});

test("parses only the supported commands and normalizes one-time pairing codes", () => {
  assert.deepEqual(parseTelegramCommand("/start ABCD2345"), { name: "start", argument: "ABCD2345" });
  assert.deepEqual(parseTelegramCommand(" /start@exchange_bot abcd2345 "), { name: "start", argument: "abcd2345" });
  assert.deepEqual(parseTelegramCommand("/help"), { name: "help", argument: "" });
  assert.deepEqual(parseTelegramCommand("/status@exchange_bot"), { name: "status", argument: "" });
  assert.deepEqual(parseTelegramCommand("/disconnect"), { name: "disconnect", argument: "" });
  assert.equal(parseTelegramCommand("/status extra"), null);
  assert.equal(parseTelegramCommand("/unknown"), null);
  assert.equal(normalizePairCode(" abcd2345 "), "ABCD2345");
  assert.equal(normalizePairCode("short"), null);
  assert.equal(normalizePairCode("invalid code"), null);
});
