export const PRIVATE_SYNC_KEY = "exchange-companion:private-cloud-sync";

export function hasPrivateEntryQuery(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.has("share")
      || params.get("auth") === "login";
  } catch {
    return false;
  }
}
