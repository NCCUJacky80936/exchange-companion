import type { MetadataRoute } from "next";
import { exchangeProfile } from "./lib/profile";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${exchangeProfile.appName}｜Exchange Companion`,
    short_name: exchangeProfile.appName,
    description: "免費的交換學生行前規劃工具：整合待辦、預算、行李、官方資源、旅行與待確認 AI 提案。",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F7F3EB",
    theme_color: "#F7F3EB",
    orientation: "any",
    icons: [
      { src: "/icons/exchange-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/exchange-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/exchange-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
