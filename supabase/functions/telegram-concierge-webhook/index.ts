import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import {
  constantTimeEqual,
  normalizePairCode,
  parseTelegramMenuAction,
  parseTelegramUpdate,
  readJsonBodyWithLimit,
  sha256Hex,
  TELEGRAM_MENU_LABELS,
  TELEGRAM_RESOURCE_GROUPS,
} from "../_shared/telegram.ts";
import { jsonResponse } from "../_shared/http.ts";
import { formatTelegramRecipe, isActiveRecipeConnection, pickTelegramRecipe, recipesFromAppState } from "../_shared/recipe.ts";
import { formatTelegramResources, resourcesFromAppState } from "../_shared/resource.ts";

type JsonRecord = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
  return jsonResponse(body, status);
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

function resourcesUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("section", "resources");
  return url.toString();
}

type TelegramReplyKeyboard = {
  keyboard: Array<Array<{ text: string }>>;
  resize_keyboard: true;
  is_persistent: true;
  input_field_placeholder: string;
};

function telegramMainMenu(): TelegramReplyKeyboard {
  return {
    keyboard: [
      [{ text: TELEGRAM_MENU_LABELS.capture }, { text: TELEGRAM_MENU_LABELS.recipe }],
      [{ text: TELEGRAM_MENU_LABELS.resources }, { text: TELEGRAM_MENU_LABELS.status }],
      [{ text: TELEGRAM_MENU_LABELS.notebook }, { text: TELEGRAM_MENU_LABELS.help }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "直接輸入一件交換事項…",
  };
}

function telegramResourceMenu(): TelegramReplyKeyboard {
  return {
    keyboard: [
      TELEGRAM_RESOURCE_GROUPS.slice(0, 2).map((item) => ({ text: item.label })),
      TELEGRAM_RESOURCE_GROUPS.slice(2, 4).map((item) => ({ text: item.label })),
      [{ text: TELEGRAM_RESOURCE_GROUPS[4].label }, { text: TELEGRAM_MENU_LABELS.home }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "選一個分類，或輸入「找資源 德鐵」…",
  };
}

async function sendTelegramMessage(token: string, chatId: number, text: string, replyMarkup: TelegramReplyKeyboard): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      link_preview_options: { is_disabled: true },
      reply_markup: replyMarkup,
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
    const status = reason === "body_too_large" ? 413 : reason === "unsupported_media_type" ? 415 : 400;
    return json({ error: reason }, status);
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
    const mainMenu = telegramMainMenu();
    const sendMain = (text: string) => sendTelegramMessage(botToken, update.chatId, text, mainMenu);

    if (update.text === null) {
      await sendMain("目前支援私人一對一文字訊息。語音、照片與附件還不能整理，你可以改用文字描述，或用下方按鈕操作。");
      return json({ ok: true });
    }

    const menuAction = parseTelegramMenuAction(update.text);

    if (update.command?.name === "start") {
      if (!update.command.argument) {
        await sendMain("這裡是「交換手帳」的 Telegram 快捷入口。若還沒連結，請先到網站的「AI 幫我整理」產生安全配對連結；完成後就能直接打字或使用下方按鈕，不用背指令。");
        return json({ ok: true });
      }
      const pairCode = normalizePairCode(update.command.argument);
      if (!pairCode) {
        await sendMain("這個配對連結無法使用。請回到網站的「AI 幫我整理」重新產生，再從新連結打開 Telegram。");
        return json({ ok: true });
      }
      const { data, error } = await admin.rpc("consume_telegram_pair_code", {
        requested_code_hash: await sha256Hex(pairCode),
        requested_telegram_user_id: update.userId,
        requested_telegram_chat_id: update.chatId,
      });
      if (error) throw error;
      if (!firstRow(data)) {
        await sendMain("這個配對連結已使用或過期。請回到網站的「AI 幫我整理」重新產生。");
        return json({ ok: true });
      }
      await sendMain(`「交換手帳」已連結。\n\n你可以直接傳一句交換事項，我會先放進整理佇列；也可以用下方按鈕找重要資源或抽一道食譜。所有更新都要回網站確認後才會套用。\n\n手帳：${inboxUrl(companionUrl)}`);
      return json({ ok: true });
    }

    if (update.command?.name === "help" || menuAction?.name === "help" || menuAction?.name === "home") {
      await sendMain("直接輸入一件交換事項，我會收進整理佇列，等排程整理成待確認提案。下方按鈕可直接找重要資源、抽食譜、查連線，或回到網站；不用記任何指令。\n\nTelegram 不會直接修改手帳，提案仍要在網站確認後才會套用。");
      return json({ ok: true });
    }

    if (menuAction?.name === "capture") {
      await sendMain("直接用一句話告訴我就可以，例如：「我已完成 Vodafone eSIM 申請」或「幫我記得抵達後辦 Anmeldung」。我會先收件，不會直接改動手帳。");
      return json({ ok: true });
    }

    if (menuAction?.name === "notebook") {
      await sendMain(`從這裡打開你的交換手帳：\n${inboxUrl(companionUrl)}`);
      return json({ ok: true });
    }

    if (update.command?.name === "status" || update.command?.name === "disconnect" || menuAction?.name === "status") {
      const { data: link, error } = await admin
        .from("telegram_links")
        .select("connection_id,linked_at,last_received_at")
        .eq("telegram_user_id", update.userId)
        .eq("telegram_chat_id", update.chatId)
        .is("revoked_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!link) {
        await sendMain("目前還沒連結「交換手帳」。請回到網站的「AI 幫我整理」產生安全配對連結，再從該連結打開 Telegram。");
        return json({ ok: true });
      }
      if (update.command?.name !== "disconnect") {
        await sendMain(`目前已連結「交換手帳」。文字只會先進入整理佇列，完成後仍要回網站確認提案。\n\n手帳：${inboxUrl(companionUrl)}`);
        return json({ ok: true });
      }
      const { error: revokeError } = await admin.rpc("revoke_telegram_connection", {
        requested_connection_id: link.connection_id,
      });
      if (revokeError) throw revokeError;
      await sendMain("已中斷 Telegram 連結，尚未處理的原文也已清除。之後可隨時從網站的「AI 幫我整理」重新配對。");
      return json({ ok: true });
    }

    const recipeArgument = update.command?.name === "recipe" || update.command?.name === "random_recipe"
      ? update.command.argument
      : menuAction?.name === "recipe" ? menuAction.argument : null;
    const resourceQuery = update.command?.name === "resource" && update.command.argument
      ? update.command.argument
      : menuAction?.name === "resource-search" ? menuAction.argument : null;
    const resourceGroupId = menuAction?.name === "resource-group" ? menuAction.argument : null;

    if (menuAction?.name === "resources" || (update.command?.name === "resource" && !update.command.argument)) {
      await sendTelegramMessage(botToken, update.chatId, "先選一個分類；也可以直接輸入「找資源 德鐵」這類自然說法。完整的智慧搜尋仍在網站資料頁。", telegramResourceMenu());
      return json({ ok: true });
    }

    if (recipeArgument !== null || resourceQuery !== null || resourceGroupId !== null) {
      const { data: link, error: linkError } = await admin
        .from("telegram_links")
        .select("user_id,connection_id")
        .eq("telegram_user_id", update.userId)
        .eq("telegram_chat_id", update.chatId)
        .is("revoked_at", null)
        .maybeSingle();
      if (linkError) throw linkError;
      if (!link) {
        await sendMain("目前還沒連結「交換手帳」。請回到網站的「AI 幫我整理」產生安全配對連結，再從該連結打開 Telegram。");
        return json({ ok: true });
      }
      const { data: connection, error: connectionError } = await admin
        .from("concierge_connections")
        .select("scopes,expires_at,revoked_at")
        .eq("id", link.connection_id)
        .eq("user_id", link.user_id)
        .maybeSingle();
      if (connectionError) throw connectionError;
      if (!isActiveRecipeConnection(connection)) {
        await sendMain("這個「交換手帳」連線已過期或停用。請回到網站重新建立 Concierge 連線並配對 Telegram。");
        return json({ ok: true });
      }
      const { data: stateRow, error: stateError } = await admin
        .from("private_app_states")
        .select("state")
        .eq("user_id", link.user_id)
        .maybeSingle();
      if (stateError) throw stateError;
      if (recipeArgument !== null) {
        const recipes = recipesFromAppState(stateRow?.state, recipeArgument);
        const recipe = pickTelegramRecipe(recipes);
        if (!recipe) {
          const suffix = recipeArgument ? `符合「${recipeArgument}」的` : "";
          await sendMain(`目前資源庫裡沒有${suffix}食譜。你可以回網站的「重要資源」查看或新增。`);
          return json({ ok: true });
        }
        await sendMain(formatTelegramRecipe(recipe, resourcesUrl(companionUrl)));
        return json({ ok: true });
      }

      const group = resourceGroupId ? TELEGRAM_RESOURCE_GROUPS.find((item) => item.id === resourceGroupId) : null;
      const resources = resourcesFromAppState(stateRow?.state, { group: resourceGroupId ?? undefined, query: resourceQuery ?? undefined });
      const heading = group?.label ?? (resourceQuery ? `搜尋「${resourceQuery}」` : "全部");
      if (!resources.length) {
        await sendMain(`目前找不到${group ? `「${group.label}」` : resourceQuery ? `符合「${resourceQuery}」` : "符合條件"}的資源。你可以到網站資料頁改用智慧搜尋。\n\n${resourcesUrl(companionUrl)}`);
        return json({ ok: true });
      }
      await sendMain(formatTelegramResources(resources, heading, resourcesUrl(companionUrl)));
      return json({ ok: true });
    }

    if (update.text.trim().startsWith("/")) {
      await sendMain("不用背指令。請直接輸入交換事項，或使用下方按鈕操作。");
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
      await sendMain("這則內容已收進整理佇列，不會重複建立。排程完成後，回網站確認提案再套用。");
      return json({ ok: true });
    }
    if (outcome === "not_linked") {
      await sendMain("目前還沒連結「交換手帳」。請回到網站的「AI 幫我整理」產生安全配對連結，再從該連結打開 Telegram。");
      return json({ ok: true });
    }
    if (outcome === "queue_full") {
      await sendMain("目前整理佇列已滿。請等下一次排程完成後再傳送，現有內容不會遺失。");
      return json({ ok: true });
    }
    if (outcome !== "queued") throw new Error("unexpected_enqueue_outcome");
    await sendMain("已收進整理佇列。排程完成後，回網站確認提案再套用；目前手帳內容沒有被修改。");
    return json({ ok: true });
  } catch {
    return json({ error: "server_error" }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
