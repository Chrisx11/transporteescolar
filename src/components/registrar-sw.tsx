"use client";

import { useEffect } from "react";

/** Registra o service worker do PWA (só em produção, para não atrapalhar o desenvolvimento). */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
