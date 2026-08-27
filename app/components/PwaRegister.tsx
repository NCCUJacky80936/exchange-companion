"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    let disposed = false;
    let idleId: number | undefined;
    let fallbackTimer: number | undefined;

    const scheduleUpdate = (registration: ServiceWorkerRegistration) => {
      const update = () => {
        if (!disposed) void registration.update();
      };
      const requestIdleCallback = window.requestIdleCallback?.bind(window);
      if (requestIdleCallback) {
        idleId = requestIdleCallback(update, { timeout: 4_000 });
      } else {
        fallbackTimer = window.setTimeout(update, 2_500);
      }
    };

    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
        if (!disposed) scheduleUpdate(registration);
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      disposed = true;
      window.removeEventListener("load", register);
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
    };
  }, []);
  return null;
}
