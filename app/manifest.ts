import type { MetadataRoute } from "next";
import { exchangeProfile } from "./lib/profile";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${exchangeProfile.appName}｜Exchange Companion`,
    short_name: exchangeProfile.appName,
    description: "AI 協助整理、可手動調整，也能安全分享旅行的交換生手帳。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FFF8E7",
    theme_color: "#2E3A34",
    orientation: "any",
    icons: [
      { src: "/icons/exchange-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/exchange-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
