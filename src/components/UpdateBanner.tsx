import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useNewVersionAvailable } from "../version";

/**
 * When a new build is deployed: reload automatically at a safe moment (no
 * round in progress), otherwise offer a one-tap reload. All game state lives in
 * Firestore, so a reload resumes exactly where the player was.
 */
export function UpdateBanner() {
  const outdated = useNewVersionAvailable();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!outdated) return;
    const midRound = () => document.querySelector(".play-guessing, .host-guessing") !== null;
    const tryReload = () => {
      if (!midRound()) window.location.reload();
    };
    tryReload();
    const id = setInterval(tryReload, 3000);
    return () => clearInterval(id);
  }, [outdated, pathname]);

  if (!outdated) return null;
  return (
    <button className="update-banner" onClick={() => window.location.reload()}>
      New version available · <b>reload</b>
    </button>
  );
}
