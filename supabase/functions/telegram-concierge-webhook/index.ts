import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import {
  constantTimeEqual,
  normalizePairCode,
  parseTelegramUpdate,
  readJsonBodyWithLimit,
  sha256Hex,
} from "../_shared/telegram.ts";

type JsonRecord = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function defaultKey(jsonName: string, legacyName: string): string {
  const values = Deno.env.get(jsonName);
  if (values) {
    const parsed = JSON.parse(values) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }
  return requiredEnv(legacyName);
}

function firstRow(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" && !Array.isArray(first) ? first as JsonRecord : null;
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function inboxUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("inbox", "open");
  return url.toString();
}

async function sendTelegramMessage(token: string, chatId: number, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      link_preview_options: { is_disabled: true },
    }),
  });
  if (!response.ok) throw new Error("telegram_send_failed");
}

export async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let webhookSecret: string;
  try {
    webhookSecret = requiredEnv("TELEGRAM_WEBHOOK_SECRET");
  } catch {
    return json({ error: "server_error" }, 500);
  }
  const suppliedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!constantTimeEqual(suppliedSecret, webhookSecret)) return json({ error: "invalid_webhook_secret" }, 401);

  let payload: unknown;
  try {
    payload = await readJsonBodyWithLimit(request);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid_json";
    return json({ error: reason }, reason === "body_too_large" ? 413 : 400);
  }

  const update = parseTelegramUpdate(payload);
  if (update.kind === "ignore") return json({ ok: true });
  if (update.kind === "invalid") return json({ error: update.reason }, 400);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const secretKey = defaultKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const botToken = requiredEnv("TELEGRAM_BOT_TOKEN");
    const companionUrl = requiredEnv("EXCHANGE_COMPANION_URL");
    const admin = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (update.text === null) {
      await sendTelegramMessage(botToken, update.chatId, "目前只接受私人一對一的文字訊息；語音、照片與附件尚未支援。");
      return json({ ok: true });
    }

    if (update.command?.name === "help") {
      await sendTelegramMessage(
        botToken,
        update.chatId,
        "直接傳送文字，我會先安全收件，並交給 Exchange Companion 排程整理成待審提案。\n\n可用指令：\n/start <配對碼>\n/status\n/disconnect\n/help\n\n提案只能在手帳網站審核與套用。",
      );
      return json({ ok: true });
    }

    if (update.command?.name === "start") {
      const pairCode = normalizePairCode(update.command.argument);
      if (!pairCode) {
        await sendTelegramMessage(botToken, update.chatId, "配對碼格式不正確。請回到手帳 AI 頁重新產生配對碼，再輸入 /start <配對碼>。");
        return json({ ok: true });
      }
      const { data, error } = await admin.rpc("consume_telegram_pair_code", {
        requested_code_hash: await sha256Hex(pairCode),
        requested_telegram_user_id: update.userId,
        requested_telegram_chat_id: update.chatId,
      });
      if (error) throw error;
      if (!firstRow(data)) {
        await sendTelegramMessage(botToken, update.chatId, "配對碼無效、已使用或已過期。請回到手帳 AI 頁重新產生配對碼。");
        return json({ ok: true });
      }
      await sendTelegramMessage(botToken, update.chatId, `配對完成。現在可以直接傳送交換事項，我會先收件並在排程執行時整理成待審提案。\n\n手帳：${inboxUrl(companionUrl)}`);
      return json({ ok: true });
    }

    if (update.command?.name === "status" || update.command?.name === "disconnect") {
      const { data: link, error } = await admin
        .from("telegram_links")
        .select("connection_id,linked_at,last_received_at")
        .eq("telegram_user_id", update.userId)
        .eq("telegram_chat_id", update.chatId)
        .is("revoked_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!link) {
        await sendTelegramMessage(botToken, update.chatId, "目前沒有連結到 Exchange Companion。請先在手帳 AI 頁產生配對碼，再輸入 /start <配對碼>。");
        return json({ ok: true });
      }
      if (update.command.name === "status") {
        await sendTelegramMessage(botToken, update.chatId, `目前已連結 Exchange Companion。你可以直接傳送文字，內容只會進入待審提案流程。\n\n手帳：${inboxUrl(companionUrl)}`);
        return json({ ok: true });
      }
      const { error: revokeError } = await admin.rpc("revoke_telegram_connection", {
        requested_connection_id: link.connection_id,
      });
      if (revokeError) throw revokeError;
      await sendTelegramMessage(botToken, update.chatId, "已中斷 Telegram 連結，尚未處理的原文也已清除。之後可隨時從手帳 AI 頁重新配對。");
      return json({ ok: true });
    }

    if (update.text.trim().startsWith("/")) {
      await sendTelegramMessage(botToken, update.chatId, "不支援這個指令。可用指令：/start <配對碼>、/status、/disconnect、/help；其他文字會作為交換手帳整理需求收件。");
      return json({ ok: true });
    }

    const { data, error } = await admin.rpc("enqueue_telegram_request", {
      requested_telegram_user_id: update.userId,
      requested_telegram_chat_id: update.chatId,
      requested_update_id: update.updateId,
      requested_message_id: update.messageId,
      requested_reply_to_message_id: update.replyToMessageId,
      requested_raw_text: update.text,
      requested_raw_hash: await sha256Hex(update.text),
    });
    if (error) throw error;
    const result = firstRow(data);
    const outcome = typeof result?.outcome === "string" ? result.outcome : "unknown";
    if (outcome === "duplicate") {
      await sendTelegramMessage(botToken, update.chatId, "已收件。內容會在你的 Exchange Companion 排程執行時整理成待審提案；手帳內容不會直接被修改。");
      return json({ ok: true });
    }
    if (outcome === "not_linked") {
      await sendTelegramMessage(botToken, update.chatId, "尚未連結 Exchange Companion。請先在手帳 AI 頁產生配對碼，再輸入 /start <配對碼>。");
      return json({ ok: true });
    }
    if (outcome === "queue_full") {
      await sendTelegramMessage(botToken, update.chatId, "目前待處理訊息已達上限，請等下一次排程完成後再傳送。");
      return json({ ok: true });
    }
    if (outcome !== "queued") throw new Error("unexpected_enqueue_outcome");
    await sendTelegramMessage(botToken, update.chatId, "已收件。內容會在你的 Exchange Companion 排程執行時整理成待審提案；手帳內容不會直接被修改。");
    return json({ ok: true });
  } catch {
    return json({ error: "server_error" }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
