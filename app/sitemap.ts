import type { MetadataRoute } from "next";
import { requestPublicBaseUrl } from "./lib/request-site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = await requestPublicBaseUrl();
  return [{
    url: baseUrl.toString(),
    changeFrequency: "monthly",
    priority: 1,
  }];
}
