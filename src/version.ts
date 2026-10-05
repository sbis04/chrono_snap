import { useEffect, useState } from "react";

declare const __APP_VERSION__: string;
export const APP_VERSION = __APP_VERSION__;

const CHECK_EVERY_MS = 60_000;

/**
 * Cache busting for long-lived tabs: poll /version.json (served no-cache) and
 * report when a newer build has been deployed. Returns true once outdated.
 */
export function useNewVersionAvailable(): boolean {
  const [outdated, setOutdated] = useState(false);
  useEffect(() => {
    if (import.meta.env.DEV) return;
    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version: string };
        if (!stopped && version && version !== APP_VERSION) setOutdated(true);
      } catch {
        // Offline or blocked — try again next time.
      }
    };
    const id = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    check();
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return outdated;
}
