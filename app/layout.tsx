import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Noto_Sans_TC } from "next/font/google";
// Keep the local preview from reusing a stale service-worker/browser CSS cache
// after visual skin iterations. Update this token when the global visual layer
// changes materially.
import "./globals.css?visual=compact-proposal-actions-20260821e";
import PwaRegister from "./components/PwaRegister";
import { exchangeProfile } from "./lib/profile";

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
.app-entry{visibility:hidden}
html[data-app-entry-ready="true"] .initial-loading-shell{display:none}
html[data-app-entry-ready="true"] .app-entry{visibility:visible}
.app-entry-boot{display:none}
.app-entry-boot-visible{display:block}
html[data-private-notebook="true"] .app-entry-public{display:none}
html[data-private-notebook="true"] .app-entry-boot{display:block}
`;

const restoreHintScript = `try{const p=new URLSearchParams(location.search);if(p.has("share")||p.get("auth")==="login")document.documentElement.dataset.privateNotebook="true"}catch{}`;

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = new URL(`${protocol}://${host}`);
  const title = `${exchangeProfile.appName}｜AI 優先的交換生旅程控制台`;
  const description = "把交換進度、行李、官方資源與不撞課的旅行規劃整理成真正做得完的下一步。";
  const socialImage = new URL(exchangeProfile.visual.socialImage, baseUrl);

  return {
    metadataBase: baseUrl,
    title,
    description,
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
      title,
      description,
      type: "website",
      images: [{ url: socialImage, width: 1731, height: 909, alt: `${exchangeProfile.appName}：${exchangeProfile.visual.routeLabel} 的手繪旅行手帳` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
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
      <head><style dangerouslySetInnerHTML={{ __html: instantBootStyle }} /><script dangerouslySetInnerHTML={{ __html: restoreHintScript }} /></head>
      <body className={notoSans.variable} style={{ backgroundColor: "#f7f3eb", color: "#303231" }}>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
