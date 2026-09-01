import LoadingShell from "./components/LoadingShell";
import AppEntry from "./components/AppEntry";
import { PUBLIC_REPOSITORY_URL, PUBLIC_SITE_DESCRIPTION, PUBLIC_SITE_NAME } from "./lib/public-site";
import { requestPublicBaseUrl } from "./lib/request-site";

export default async function Home() {
  const baseUrl = await requestPublicBaseUrl();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: PUBLIC_SITE_NAME,
    alternateName: "交換學生 Exchange Student Planner",
    url: baseUrl.toString(),
    description: PUBLIC_SITE_DESCRIPTION,
    applicationCategory: "TravelApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript; installable as a progressive web app",
    inLanguage: ["zh-Hant", "en"],
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    sameAs: [PUBLIC_REPOSITORY_URL],
    featureList: [
      "Exchange student task and deadline planning",
      "Smart official resource search and categories",
      "Budget, packing and travel planning",
      "Telegram quick capture with reviewable proposals",
      "Optional private Supabase sync",
    ],
  };

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c") }} />
    <div className="initial-loading-shell"><LoadingShell /></div>
    <AppEntry />
  </>;
}
