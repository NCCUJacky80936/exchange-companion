import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Caveat, Noto_Sans_TC, LXGW_WenKai_TC } from "next/font/google";
import "./globals.css";
import PwaRegister from "./components/PwaRegister";

const notoSans = Noto_Sans_TC({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const handChinese = LXGW_WenKai_TC({
  variable: "--font-hand-zh",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const caveat = Caveat({
  variable: "--font-hand-en",
  subsets: ["latin"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = new URL(`${protocol}://${host}`);
  const title = "交換手帳｜AI 優先的交換生旅程控制台";
  const description = "把交換進度、行李、官方資源與不撞課的旅行規劃整理成真正做得完的下一步。";
  const socialImage = new URL("/og.png", baseUrl);

  return {
    metadataBase: baseUrl,
    title,
    description,
    icons: {
      icon: "/images/doodle-icons/passport-safe.png",
      shortcut: "/images/doodle-icons/passport-safe.png",
    },
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "交換手帳",
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: socialImage, width: 1731, height: 909, alt: "交換手帳：Taipei 到 Stuttgart 的手繪旅行手帳" }],
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
  themeColor: "#FFF8E7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className={`${notoSans.variable} ${handChinese.variable} ${caveat.variable}`}>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
