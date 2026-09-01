export const PUBLIC_REPOSITORY_URL = "https://github.com/NCCUJacky80936/exchange-companion";
export const PUBLIC_SITE_NAME = "Exchange Companion 交換手帳";
export const PUBLIC_SITE_TITLE = "Exchange Companion 交換手帳｜交換學生行前規劃工具";
export const PUBLIC_SITE_DESCRIPTION = "免費、可自行架設的交換學生與 study abroad 行前規劃工具，整合待辦、預算、行李、官方資源、旅行與 Telegram；AI 只產生待確認提案。";

const managedHostingSuffixes = [".chatgpt.site", ".pages.dev", ".vercel.app", ".netlify.app", ".example"];

function configuredOrigin(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return null;
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function safeForwardedHost(value: string | null | undefined): string | null {
  const host = value?.split(",", 1)[0]?.trim().toLowerCase() ?? "";
  if (!host || host.length > 253 || !/^[a-z0-9.-]+(?::\d{1,5})?$/.test(host)) return null;
  const [hostname, port] = host.split(":", 2);
  if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) return null;
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  const managed = managedHostingSuffixes.some((suffix) => hostname.endsWith(suffix));
  return local || managed ? host : null;
}

export function resolvePublicBaseUrl(options: {
  configuredUrl?: string;
  forwardedHost?: string | null;
  host?: string | null;
  forwardedProto?: string | null;
}): URL {
  const configured = configuredOrigin(options.configuredUrl);
  if (configured) return configured;

  const host = safeForwardedHost(options.forwardedHost) ?? safeForwardedHost(options.host);
  if (!host) return new URL("http://localhost:3000/");
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const forwardedProto = options.forwardedProto?.split(",", 1)[0]?.trim().toLowerCase();
  const protocol = isLocal && forwardedProto !== "https" ? "http" : "https";
  return new URL(`${protocol}://${host}/`);
}
