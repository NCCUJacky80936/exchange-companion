"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      const hadController = Boolean(navigator.serviceWorker.controller);
      const reloadKey = "exchange-companion:pwa-refresh-v2-4";
      const handleControllerChange = () => {
        if (!hadController || window.sessionStorage.getItem(reloadKey)) return;
        window.sessionStorage.setItem(reloadKey, "done");
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
      void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => registration.update());
      return () => navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    }
  }, []);
  return null;
}
