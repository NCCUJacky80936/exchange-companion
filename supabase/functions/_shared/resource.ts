const TELEGRAM_RESOURCE_MAX_CHARACTERS = 3_900;

type JsonRecord = Record<string, unknown>;

export type TelegramResourceGroupId = "admin" | "school" | "living" | "transport" | "food" | "other";

export interface TelegramResource {
  title: string;
  description: string;
  category: string;
  url: string;
  sourceLabel: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("zh-TW").replace(/[^\p{Letter}\p{Number}]+/gu, " ").trim();
}

export function telegramResourceGroup(category: string): TelegramResourceGroupId {
  if (/食譜|料理|食材|採買|超市|菜單/.test(category)) return "food";
  if (/學校|學業|日曆|選課|課程|考試|學分|校園/.test(category)) return "school";
  if (/交通|航班|飛機|行李|海關|火車|票券|鐵路|機票/.test(category)) return "transport";
  if (/住宿|生活|醫療|緊急|網路|門號|電信/.test(category)) return "living";
  if (/簽證|居留|行政|財力|保險|銀行|報到|登記/.test(category)) return "admin";
  return "other";
}

function safeUrl(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function resourcesFromAppState(state: unknown, options: { group?: string; query?: string } = {}): TelegramResource[] {
  if (!isRecord(state) || !Array.isArray(state.resources)) return [];
  const query = normalized(options.query ?? "");
  const terms = query.split(" ").filter(Boolean);
  return state.resources.flatMap((value) => {
    if (!isRecord(value)) return [];
    const category = text(value.category);
    if (options.group && telegramResourceGroup(category) !== options.group) return [];
    const resource = {
      title: text(value.title),
      description: text(value.description),
      category,
      url: safeUrl(value.url),
      sourceLabel: text(value.sourceLabel),
    };
    if (!resource.title || !resource.description || !resource.category) return [];
    const haystack = normalized(`${resource.title} ${resource.description} ${text(value.details)} ${category} ${text(value.region)} ${resource.sourceLabel} ${Array.isArray(value.searchTags) ? value.searchTags.join(" ") : ""}`);
    return terms.length && !terms.every((term) => haystack.includes(term)) ? [] : [resource];
  }).slice(0, 5);
}

function truncate(value: string, maximum: number): string {
  const characters = Array.from(value);
  return characters.length <= maximum ? value : `${characters.slice(0, Math.max(0, maximum - 1)).join("")}…`;
}

export function formatTelegramResources(resources: TelegramResource[], heading: string, companionUrl: string): string {
  const intro = `重要資源｜${heading}`;
  const items = resources.map((resource, index) => {
    const source = [resource.sourceLabel ? `來源：${truncate(resource.sourceLabel, 100)}` : "", resource.url].filter(Boolean).join("\n");
    return [`${index + 1}. ${truncate(resource.title, 150)}`, truncate(resource.description, 320), source].filter(Boolean).join("\n");
  });
  return truncate([intro, ...items, `完整內容與智慧搜尋：${companionUrl}`].join("\n\n"), TELEGRAM_RESOURCE_MAX_CHARACTERS);
}
