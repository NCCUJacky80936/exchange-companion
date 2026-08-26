"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => registration.update());
    };
    const requestIdleCallback = window.requestIdleCallback?.bind(window);
    if (requestIdleCallback) {
      const idleId = requestIdleCallback(register, { timeout: 4_000 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = window.setTimeout(register, 2_500);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
