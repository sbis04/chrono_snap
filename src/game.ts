import { useEffect } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { api, db, ensureUser } from "./firebase";
import type { Room } from "./types";

const RECENT_KEY = "cs-recent-photos";

export function recentIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function rememberPhotos(ids: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([...new Set([...ids, ...recentIds()])].slice(0, 120)));
  } catch {}
}

/** Join (or rejoin/rename in) a room as the signed-in user. */
export async function joinRoom(code: string, name: string) {
  const user = await ensureUser();
  const room = await getDoc(doc(db, "rooms", code));
  if (!room.exists()) throw new Error(`No room called ${code}. Double-check the code.`);
  if (room.data().status === "finished") throw new Error("That game has finished. Ask the host to start a new one.");
  const ref = doc(db, "rooms", code, "players", user.uid);
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    await setDoc(ref, { name, score: 0, lockedRound: -1, joinedAt: serverTimestamp() });
  } else if (existing.data().name !== name) {
    await setDoc(ref, { name }, { merge: true });
  }
}

export const startOrAdvance = (code: string) => api.advance({ code, recentIds: recentIds() });

/**
 * Fallbacks for the server's timer tasks: shortly after a round's deadline or a
 * reveal's `nextAt` passes, every connected client nudges the server, which
 * re-checks that the transition is actually due (so duplicates are no-ops).
 */
export function useServerTimerNudges(room: Room | null | undefined) {
  const endsAtMs = room?.status === "guessing" ? room.roundEndsAt?.toMillis() ?? null : null;
  const nextAtMs = room?.status === "reveal" ? room.nextAt?.toMillis() ?? null : null;
  const code = room?.code;
  const round = room?.currentRound;
  useEffect(() => {
    if (!endsAtMs || !code || round === undefined) return;
    const id = setTimeout(
      () => api.revealRound({ code, round }).catch(() => undefined),
      Math.max(0, endsAtMs - Date.now()) + 3000 + Math.random() * 1500,
    );
    return () => clearTimeout(id);
  }, [endsAtMs, code, round]);
  useEffect(() => {
    if (!nextAtMs || !code || round === undefined) return;
    const id = setTimeout(
      () => api.advance({ code, auto: true, round, recentIds: recentIds() }).catch(() => undefined),
      Math.max(0, nextAtMs - Date.now()) + 2500 + Math.random() * 1500,
    );
    return () => clearTimeout(id);
  }, [nextAtMs, code, round]);
}
