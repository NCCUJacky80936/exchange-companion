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
      const standalone = window.matchMedia("(display-mode: standalone)").matches
        || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      if (standalone) {
        fallbackTimer = window.setTimeout(update, 250);
        return;
      }
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
      }).catch(() => undefined);
    };

    // Let the server-rendered loading shell paint, then update the worker without
    // waiting for every image and private notebook chunk to finish loading.
    const frameId = window.requestAnimationFrame(register);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
    };
  }, []);
  return null;
}
