"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { shouldResumePrivateNotebook } from "../lib/cloud-session";
import PublicWelcome from "./PublicWelcome";

const loadExchangeCompanion = () => import("./ExchangeCompanion");
const ExchangeCompanion = lazy(loadExchangeCompanion);

if (typeof window !== "undefined" && shouldResumePrivateNotebook()) void loadExchangeCompanion();

function InstantBoot() {
  return <div className="instant-boot" role="status"><span>旅</span><strong>交換手帳</strong><p>正在確認登入狀態…</p></div>;
}

export default function AppEntry() {
  const [launchApp, setLaunchApp] = useState(false);
  const [initialAuthView, setInitialAuthView] = useState<"welcome" | "login">("welcome");

  useEffect(() => {
    if (!shouldResumePrivateNotebook()) return;
    const frame = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("auth") === "login") setInitialAuthView("login");
      setLaunchApp(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (launchApp) return <Suspense fallback={<InstantBoot />}><ExchangeCompanion initialAuthView={initialAuthView} /></Suspense>;

  const openLogin = () => {
    document.documentElement.dataset.privateNotebook = "true";
    setInitialAuthView("login");
    setLaunchApp(true);
  };

  return <div className="app-entry"><div className="app-entry-public"><PublicWelcome onLogin={openLogin} /></div><div className="app-entry-boot"><InstantBoot /></div></div>;
}
