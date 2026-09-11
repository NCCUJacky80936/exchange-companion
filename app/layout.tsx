import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC } from "next/font/google";
// Keep the local preview from reusing a stale service-worker/browser CSS cache
// after visual skin iterations. Update this token when the global visual layer
// changes materially.
import "./globals.css?visual=compact-proposal-actions-20260821e";
import PwaRegister from "./components/PwaRegister";
import { exchangeProfile } from "./lib/profile";
import { PUBLIC_SITE_DESCRIPTION, PUBLIC_SITE_NAME, PUBLIC_SITE_TITLE } from "./lib/public-site";
import { requestPublicBaseUrl } from "./lib/request-site";

const notoSans = Noto_Sans_TC({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const instantBootStyle = `
html{background:#f7f3eb;color:#303231}
body{margin:0;background:#f7f3eb;color:#303231}
.initial-loading-shell{position:fixed;inset:0;z-index:1000;display:block;background:#f7f3eb}
.loading-shell{box-sizing:border-box;display:grid;min-height:100vh;min-height:100svh;min-height:100dvh;place-content:center;justify-items:center;gap:10px;padding:calc(18px + env(safe-area-inset-top)) 20px calc(18px + env(safe-area-inset-bottom));background:#f7f3eb;color:#303231;font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei","Segoe UI",sans-serif;text-align:center}
.loading-brand{display:grid;width:52px;height:52px;place-items:center;border-radius:16px;background:#efd47a;color:#303231;font-size:21px;font-weight:800;line-height:1}
.loading-shell strong{font-size:23px;line-height:1.25}.loading-shell p{margin:0;color:#7c7f79;font-size:14px;line-height:1.5}
.startup-recovery{visibility:hidden;animation:show-startup-recovery 0s 12s forwards}.startup-recovery a{display:inline-block;margin-top:12px;padding:10px 18px;border:1px solid #7c7f79;border-radius:12px;color:#303231;background:#fff;text-decoration:none;font:inherit}@keyframes show-startup-recovery{to{visibility:visible}}
.app-entry{visibility:hidden}
html[data-app-entry-ready="true"] .initial-loading-shell{display:none}
html[data-app-entry-ready="true"] .app-entry{visibility:visible}
.app-entry-boot{display:none}
.app-entry-boot-visible{display:block}
html[data-private-notebook="true"] .app-entry-public{display:none}
html[data-private-notebook="true"] .app-entry-boot{display:block}
`;

const restoreHintScript = `try{const p=new URLSearchParams(location.search);if(p.has("share")||p.get("auth")==="login")document.documentElement.dataset.privateNotebook="true"}catch{}`;
// This recovery works even when an old cached entry chunk cannot hydrate React.
// Preserve share/auth query parameters and hash tokens, and never clear storage.
const startupRecoveryScript = `document.addEventListener("click",function(e){const a=e.target.closest&&e.target.closest("[data-startup-reload]");if(!a)return;e.preventDefault();const u=new URL(location.href);u.searchParams.set("__fresh",String(Date.now()));location.replace(u.href)})`;

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await requestPublicBaseUrl();
  const socialImage = new URL("/og.png", baseUrl);

  return {
    metadataBase: baseUrl,
    title: PUBLIC_SITE_TITLE,
    description: PUBLIC_SITE_DESCRIPTION,
    applicationName: PUBLIC_SITE_NAME,
    alternates: { canonical: "/" },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    icons: {
      icon: [
        { url: "/icons/exchange-48.png", sizes: "48x48", type: "image/png" },
        { url: exchangeProfile.visual.icon, sizes: "192x192", type: "image/png" },
      ],
      shortcut: "/icons/exchange-48.png",
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: exchangeProfile.appName,
    },
    openGraph: {
      title: PUBLIC_SITE_TITLE,
      description: PUBLIC_SITE_DESCRIPTION,
      type: "website",
      url: "/",
      siteName: PUBLIC_SITE_NAME,
      locale: "zh_TW",
      images: [{ url: socialImage, width: 1731, height: 909, alt: `${PUBLIC_SITE_NAME} 的手繪旅行手帳介面` }],
    },
    twitter: {
      card: "summary_large_image",
      title: PUBLIC_SITE_TITLE,
      description: PUBLIC_SITE_DESCRIPTION,
      images: [socialImage],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F7F3EF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={exchangeProfile.language} suppressHydrationWarning>
      <head>
        <link rel="apple-touch-startup-image" href="/icons/apple-touch-startup.png" />
        <style dangerouslySetInnerHTML={{ __html: instantBootStyle }} />
        <noscript><style>{`.initial-loading-shell,.app-entry-boot{display:none!important}.app-entry{visibility:visible!important}`}</style></noscript>
        <script dangerouslySetInnerHTML={{ __html: restoreHintScript }} />
        <script dangerouslySetInnerHTML={{ __html: startupRecoveryScript }} />
      </head>
      <body className={notoSans.variable} style={{ backgroundColor: "#f7f3eb", color: "#303231" }}>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
