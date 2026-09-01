"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { hasPrivateEntryQuery } from "../lib/cloud-session";
import { markExchangePerformance } from "../lib/performance";
import LoadingShell from "./LoadingShell";
import PublicWelcome from "./PublicWelcome";

const loadExchangeCompanion = () => import("./ExchangeCompanion");
const ExchangeCompanion = lazy(loadExchangeCompanion);
const cloudConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

if (typeof window !== "undefined" && (cloudConfigured || hasPrivateEntryQuery())) void loadExchangeCompanion();

export default function AppEntry() {
  const [launchApp, setLaunchApp] = useState(false);
  const [initialAuthView, setInitialAuthView] = useState<"welcome" | "login">("welcome");

  useEffect(() => {
    markExchangePerformance("boot-start");
    if (cloudConfigured || hasPrivateEntryQuery()) document.documentElement.dataset.privateNotebook = "true";
    document.documentElement.dataset.appEntryReady = "true";
    if (!cloudConfigured && !hasPrivateEntryQuery()) return;
    const frame = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("auth") === "login") setInitialAuthView("login");
      setLaunchApp(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (launchApp) return <Suspense fallback={<LoadingShell message="正在確認登入狀態…" />}><ExchangeCompanion initialAuthView={initialAuthView} /></Suspense>;

  const openLogin = () => {
    document.documentElement.dataset.privateNotebook = "true";
    setInitialAuthView("login");
    setLaunchApp(true);
  };

  return <div className="app-entry">
    <div className="app-entry-public"><PublicWelcome onLogin={openLogin} /></div>
    {cloudConfigured ? <div className="app-entry-boot app-entry-boot-visible"><LoadingShell message="正在確認登入狀態…" /></div> : null}
  </div>;
}
