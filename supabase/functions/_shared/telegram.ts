export const TELEGRAM_MAX_TEXT_CHARACTERS = 4096;
export const TELEGRAM_MAX_WEBHOOK_BYTES = 64 * 1024;
export { readJsonBodyWithLimit } from "./http.ts";

export type TelegramCommand =
  | { name: "start"; argument: string }
  | { name: "recipe" | "random_recipe" | "resource"; argument: string }
  | { name: "help" | "status" | "disconnect"; argument: "" };

export const TELEGRAM_MENU_LABELS = {
  capture: "整理一件事",
  recipe: "隨機食譜",
  resources: "重要資源",
  status: "連線狀態",
  help: "使用說明",
  notebook: "開啟交換手帳",
  home: "回主選單",
} as const;

export const TELEGRAM_RESOURCE_GROUPS = [
  { id: "admin", label: "申請與行政" },
  { id: "school", label: "學校與學業" },
  { id: "living", label: "住宿與生活" },
  { id: "transport", label: "交通與行李" },
  { id: "food", label: "料理與採買" },
] as const;

export type TelegramMenuAction =
  | { name: "capture" | "resources" | "status" | "help" | "notebook" | "home"; argument: "" }
  | { name: "recipe" | "resource-search" | "resource-group"; argument: string };

export type ParsedTelegramUpdate =
  | { kind: "ignore" }
  | { kind: "invalid"; reason: "invalid_update_id" | "invalid_private_message" | "invalid_text" }
  | {
      kind: "private-message";
      updateId: number;
      messageId: number;
      userId: number;
      chatId: number;
      replyToMessageId: number | null;
      text: string | null;
      command: TelegramCommand | null;
    };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isSafeTelegramId(value: unknown, options: { positive?: boolean } = {}): value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return false;
  return options.positive === false ? value !== 0 : value > 0;
}

export function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export function telegramTextLength(value: string): number {
  return Array.from(value).length;
}

export function parseTelegramCommand(text: string): TelegramCommand | null {
  const match = text.trim().match(/^\/(start|help|status|disconnect|recipe|random_recipe|resource)(?:@[A-Za-z0-9_]{5,32})?(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  const name = match[1].toLowerCase() as TelegramCommand["name"];
  const argument = (match[2] ?? "").trim();
  if (name === "start" || name === "recipe" || name === "random_recipe" || name === "resource") return { name, argument };
  if (argument) return null;
  return { name, argument: "" };
}

export function parseTelegramMenuAction(text: string): TelegramMenuAction | null {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized === TELEGRAM_MENU_LABELS.capture) return { name: "capture", argument: "" };
  if (normalized === TELEGRAM_MENU_LABELS.recipe) return { name: "recipe", argument: "" };
  if (normalized === TELEGRAM_MENU_LABELS.resources) return { name: "resources", argument: "" };
  if (normalized === TELEGRAM_MENU_LABELS.status) return { name: "status", argument: "" };
  if (normalized === TELEGRAM_MENU_LABELS.help) return { name: "help", argument: "" };
  if (normalized === TELEGRAM_MENU_LABELS.notebook) return { name: "notebook", argument: "" };
  if (normalized === TELEGRAM_MENU_LABELS.home) return { name: "home", argument: "" };

  const group = TELEGRAM_RESOURCE_GROUPS.find((item) => item.label === normalized);
  if (group) return { name: "resource-group", argument: group.id };

  const resourceMatch = normalized.match(/^(?:找|搜尋)?(?:重要)?資源(?:[：:\s]+(.+))?$/);
  if (resourceMatch) return resourceMatch[1]
    ? { name: "resource-search", argument: resourceMatch[1].trim() }
    : { name: "resources", argument: "" };
  const naturalResourceMatch = normalized.match(/^(?:我想|幫我)?(?:找|搜尋)(?:一下)?\s*(.{1,60}?)(?:的)?(?:資源|資料)$/);
  if (naturalResourceMatch) return { name: "resource-search", argument: naturalResourceMatch[1].trim() };

  const recipeMatch = normalized.match(/^(?:找|搜尋)?食譜(?:[：:\s]+(.+))?$/);
  if (recipeMatch) return { name: "recipe", argument: recipeMatch[1]?.trim() ?? "" };
  const recipeSuffixMatch = normalized.match(/^(.{1,60})食譜$/);
  if (recipeSuffixMatch) return { name: "recipe", argument: recipeSuffixMatch[1].trim() };
  return null;
}

export function normalizePairCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9_-]{6,64}$/.test(normalized) ? normalized : null;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function parseTelegramUpdate(value: unknown): ParsedTelegramUpdate {
  if (!isRecord(value) || !isSafeTelegramId(value.update_id)) {
    return { kind: "invalid", reason: "invalid_update_id" };
  }
  if (!isRecord(value.message)) return { kind: "ignore" };
  const message = value.message;
  if (!isRecord(message.chat) || message.chat.type !== "private") return { kind: "ignore" };

  if (
    !isSafeTelegramId(message.message_id)
    || !isSafeTelegramId(message.chat.id, { positive: false })
    || !isRecord(message.from)
    || !isSafeTelegramId(message.from.id)
  ) {
    return { kind: "invalid", reason: "invalid_private_message" };
  }

  let replyToMessageId: number | null = null;
  if (message.reply_to_message !== undefined) {
    if (!isRecord(message.reply_to_message) || !isSafeTelegramId(message.reply_to_message.message_id)) {
      return { kind: "invalid", reason: "invalid_private_message" };
    }
    replyToMessageId = message.reply_to_message.message_id;
  }

  if (message.text === undefined) {
    return {
      kind: "private-message",
      updateId: value.update_id,
      messageId: message.message_id,
      userId: message.from.id,
      chatId: message.chat.id,
      replyToMessageId,
      text: null,
      command: null,
    };
  }
  if (
    typeof message.text !== "string"
    || !message.text.trim()
    || telegramTextLength(message.text) > TELEGRAM_MAX_TEXT_CHARACTERS
  ) {
    return { kind: "invalid", reason: "invalid_text" };
  }

  return {
    kind: "private-message",
    updateId: value.update_id,
    messageId: message.message_id,
    userId: message.from.id,
    chatId: message.chat.id,
    replyToMessageId,
    text: message.text,
    command: parseTelegramCommand(message.text),
  };
}
