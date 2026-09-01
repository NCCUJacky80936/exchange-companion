const TELEGRAM_RECIPE_MAX_CHARACTERS = 3_900;

type JsonRecord = Record<string, unknown>;

export interface TelegramRecipe {
  title: string;
  description: string;
  details: string;
  url: string;
  sourceLabel: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecipeResource(value: JsonRecord): boolean {
  const tags = Array.isArray(value.searchTags) ? value.searchTags.filter((item): item is string => typeof item === "string") : [];
  return value.privacy === "private" && /食譜|料理|recipe/i.test(`${text(value.category)} ${tags.join(" ")}`);
}

export function isActiveRecipeConnection(value: unknown, now = Date.now()): boolean {
  if (!isRecord(value) || value.revoked_at !== null || typeof value.expires_at !== "string") return false;
  const expiresAt = Date.parse(value.expires_at);
  const scopes = Array.isArray(value.scopes) ? value.scopes : [];
  return Number.isFinite(expiresAt) && expiresAt > now && scopes.includes("read_state");
}

export function recipesFromAppState(state: unknown, keyword = ""): TelegramRecipe[] {
  if (!isRecord(state) || !Array.isArray(state.resources)) return [];
  const normalizedKeyword = keyword.trim().toLowerCase();
  return state.resources.flatMap((value) => {
    if (!isRecord(value) || !isRecipeResource(value)) return [];
    const recipe = {
      title: text(value.title),
      description: text(value.description),
      details: text(value.details),
      url: text(value.url),
      sourceLabel: text(value.sourceLabel),
    };
    if (!recipe.title || !recipe.description || !recipe.details) return [];
    const haystack = `${recipe.title} ${recipe.description} ${recipe.details} ${text(value.category)} ${text(value.region)} ${recipe.sourceLabel} ${Array.isArray(value.searchTags) ? value.searchTags.join(" ") : ""}`.toLowerCase();
    return normalizedKeyword && !haystack.includes(normalizedKeyword) ? [] : [recipe];
  });
}

export function pickTelegramRecipe(recipes: TelegramRecipe[], random: () => number = Math.random): TelegramRecipe | null {
  if (!recipes.length) return null;
  const index = Math.min(Math.floor(Math.max(0, random()) * recipes.length), recipes.length - 1);
  return recipes[index] ?? null;
}

function truncate(value: string, maximum: number): string {
  const characters = Array.from(value);
  return characters.length <= maximum ? value : `${characters.slice(0, Math.max(0, maximum - 1)).join("")}…`;
}

export function formatTelegramRecipe(recipe: TelegramRecipe, companionUrl: string): string {
  const title = truncate(recipe.title, 180);
  const description = truncate(recipe.description, 600);
  const sourceLabel = truncate(recipe.sourceLabel, 160);
  const url = truncate(recipe.url, 800);
  const notebookUrl = truncate(companionUrl, 800);
  const source = [sourceLabel ? `來源：${sourceLabel}` : "", url].filter(Boolean).join("\n");
  const fixed = [`🍳 ${title}`, description, source, `手帳：${notebookUrl}`].filter(Boolean).join("\n\n");
  const detailsBudget = Math.max(0, TELEGRAM_RECIPE_MAX_CHARACTERS - Array.from(fixed).length - 2);
  return truncate([`🍳 ${title}`, description, truncate(recipe.details, detailsBudget), source, `手帳：${notebookUrl}`].filter(Boolean).join("\n\n"), TELEGRAM_RECIPE_MAX_CHARACTERS);
}
