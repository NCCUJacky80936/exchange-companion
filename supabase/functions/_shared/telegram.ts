export const TELEGRAM_MAX_TEXT_CHARACTERS = 4096;
export const TELEGRAM_MAX_WEBHOOK_BYTES = 64 * 1024;

export type TelegramCommand =
  | { name: "start"; argument: string }
  | { name: "recipe" | "random_recipe"; argument: string }
  | { name: "help" | "status" | "disconnect"; argument: "" };

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
  const match = text.trim().match(/^\/(start|help|status|disconnect|recipe|random_recipe)(?:@[A-Za-z0-9_]{5,32})?(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  const name = match[1].toLowerCase() as TelegramCommand["name"];
  const argument = (match[2] ?? "").trim();
  if (name === "start" || name === "recipe" || name === "random_recipe") return { name, argument };
  if (argument) return null;
  return { name, argument: "" };
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

export async function readJsonBodyWithLimit(request: Request, maximumBytes = TELEGRAM_MAX_WEBHOOK_BYTES): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) throw new Error("invalid_content_length");
    if (parsedLength > maximumBytes) throw new Error("body_too_large");
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maximumBytes) throw new Error("body_too_large");
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("invalid_json");
  }
}
