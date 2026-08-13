export const SIDEBAR_NOTE_LIMIT = 27;

export function notebookCharacterCount(value: string): number {
  return Array.from(value).length;
}

export function limitSidebarNote(value: string): string {
  return Array.from(value).slice(0, SIDEBAR_NOTE_LIMIT).join("");
}
