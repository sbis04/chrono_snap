import { initializeApp } from "firebase/app";
import { initializeAuth, signInAnonymously, connectAuthEmulator, onAuthStateChanged, browserLocalPersistence, browserSessionPersistence, type User } from "firebase/auth";
import { initializeFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";

const app = initializeApp(
  useEmulators
    ? { apiKey: "demo-key", projectId: "demo-chronosnap", authDomain: "localhost" }
    : {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      },
);

// Local emulator testing: per-tab sessions so several tabs can act as separate devices.
export const auth = initializeAuth(app, { persistence: useEmulators ? browserSessionPersistence : browserLocalPersistence });
// Long-polling auto-detection keeps games working behind corporate proxies that break WebChannel streams.
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
const functions = getFunctions(app, "us-central1");

if (useEmulators) {
  const host = window.location.hostname;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
}

let userPromise: Promise<User> | null = null;
export function ensureUser(): Promise<User> {
  userPromise ??= new Promise<User>((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        unsub();
        resolve(u);
      }
    });
    auth.authStateReady().then(() => {
      if (!auth.currentUser) signInAnonymously(auth).catch(reject);
    });
  });
  return userPromise;
}

function call<Req, Res>(name: string) {
  const fn = httpsCallable<Req, Res>(functions, name);
  return async (data: Req): Promise<Res> => {
    await ensureUser();
    return (await fn(data)).data;
  };
}

export const api = {
  createRoom: call<{ totalRounds: number; roundSeconds: number; autoAdvanceSeconds: number }, { code: string }>("createRoom"),
  advance: call<{ code: string; recentIds?: string[]; auto?: boolean; round?: number }, { ok: boolean }>("advance"),
  revealRound: call<{ code: string; round: number; force?: boolean }, { ok: boolean }>("revealRound"),
  resetRoom: call<{ code: string }, { ok: boolean }>("resetRoom"),
  kickPlayer: call<{ code: string; playerUid: string }, { ok: boolean }>("kickPlayer"),
  endGame: call<{ code: string }, { ok: boolean }>("endGame"),
  serverTime: call<void, { now: number }>("serverTime"),
};

let offsetMs = 0;
let offsetPromise: Promise<void> | null = null;
/**
 * Estimate server − client clock offset (NTP-style midpoint), trusting the
 * sample with the smallest round trip so a slow call can't skew it.
 */
export function syncClock(force = false): Promise<void> {
  if (force) offsetPromise = null;
  offsetPromise ??= (async () => {
    try {
      let best = { rtt: Infinity, offset: 0 };
      for (let i = 0; i < 4; i++) {
        const t0 = Date.now();
        const { now } = await api.serverTime();
        const t1 = Date.now();
        if (t1 - t0 < best.rtt) best = { rtt: t1 - t0, offset: now - (t0 + t1) / 2 };
      }
      if (best.rtt < 2000) offsetMs = best.offset;
    } catch {
      // Keep the previous estimate.
    }
  })();
  return offsetPromise;
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncClock(true);
  });
}
export const serverNow = () => Date.now() + offsetMs;
