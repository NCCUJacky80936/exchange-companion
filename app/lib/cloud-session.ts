export const PRIVATE_SYNC_KEY = "exchange-companion:private-cloud-sync";

export function shouldResumePrivateNotebook(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return window.localStorage.getItem(PRIVATE_SYNC_KEY) === "on"
      || params.has("share")
      || params.get("auth") === "login";
  } catch {
    return false;
  }
}
