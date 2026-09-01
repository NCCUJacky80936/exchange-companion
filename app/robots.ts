import type { MetadataRoute } from "next";
import { requestPublicBaseUrl } from "./lib/request-site";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const baseUrl = await requestPublicBaseUrl();
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      { userAgent: ["OAI-SearchBot", "ChatGPT-User"], allow: "/" },
      { userAgent: "GPTBot", disallow: "/" },
    ],
    sitemap: new URL("/sitemap.xml", baseUrl).toString(),
  };
}
