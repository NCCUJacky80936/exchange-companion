import { headers } from "next/headers";
import { resolvePublicBaseUrl } from "./public-site";

export async function requestPublicBaseUrl(): Promise<URL> {
  const requestHeaders = await headers();
  return resolvePublicBaseUrl({
    configuredUrl: process.env.PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL,
    forwardedHost: requestHeaders.get("x-forwarded-host"),
    host: requestHeaders.get("host"),
    forwardedProto: requestHeaders.get("x-forwarded-proto"),
  });
}
