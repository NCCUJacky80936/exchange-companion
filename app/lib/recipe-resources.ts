import type { ResourceItem } from "./types";

function recipeText(resource: ResourceItem): string {
  return `${resource.category} ${(resource.searchTags ?? []).join(" ")}`.toLowerCase();
}

export function isRecipeResource(resource: ResourceItem): boolean {
  return /食譜|料理|recipe/.test(recipeText(resource));
}

export function pickRandomRecipe(
  resources: ResourceItem[],
  random: () => number = Math.random,
): ResourceItem | null {
  const recipes = resources.filter(isRecipeResource);
  if (!recipes.length) return null;
  const index = Math.min(Math.floor(Math.max(0, random()) * recipes.length), recipes.length - 1);
  return recipes[index] ?? null;
}
