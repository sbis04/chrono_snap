import { useEffect, useState } from "react";
import { doc, collection, onSnapshot } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db, ensureUser, serverNow, syncClock } from "./firebase";
import type { Player, Room, RoundResult } from "./types";

export function useUser(): User | null {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    ensureUser().then(setUser);
    syncClock();
  }, []);
  return user;
}

/** undefined = loading, null = missing */
export function useRoom(code: string | undefined, enabled: boolean): Room | null | undefined {
  const [room, setRoom] = useState<Room | null | undefined>(undefined);
  useEffect(() => {
    if (!code || !enabled) return;
    return onSnapshot(
      doc(db, "rooms", code),
      (s) => setRoom(s.exists() ? (s.data() as Room) : null),
      () => setRoom(null),
    );
  }, [code, enabled]);
  return room;
}

export function usePlayers(code: string | undefined, enabled: boolean): Player[] {
  const [players, setPlayers] = useState<Player[]>([]);
  useEffect(() => {
    if (!code || !enabled) return;
    return onSnapshot(collection(db, "rooms", code, "players"), (s) => {
      const list = s.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Player, "uid">) }));
      list.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
      setPlayers(list);
    });
  }, [code, enabled]);
  return players;
}

export function useResult(code: string | undefined, round: number | undefined, enabled: boolean): RoundResult | null {
  const [result, setResult] = useState<RoundResult | null>(null);
  useEffect(() => {
    setResult(null);
    if (!code || round === undefined || round < 0 || !enabled) return;
    return onSnapshot(doc(db, "rooms", code, "results", String(round)), (s) =>
      setResult(s.exists() ? (s.data() as RoundResult) : null),
    );
  }, [code, round, enabled]);
  return result;
}

/** Milliseconds remaining until `endsAtMs` on the server clock, ticking at ~10Hz. */
export function useCountdown(endsAtMs: number | null): number {
  const [left, setLeft] = useState(() => (endsAtMs ? Math.max(0, endsAtMs - serverNow()) : 0));
  useEffect(() => {
    if (!endsAtMs) {
      setLeft(0);
      return;
    }
    const tick = () => setLeft(Math.max(0, endsAtMs - serverNow()));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [endsAtMs]);
  return left;
}

export function useLocalStorage(key: string, initial: string): [string, (v: string) => void] {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) ?? initial;
    } catch {
      return initial;
    }
  });
  const set = (v: string) => {
    setValue(v);
    try {
      localStorage.setItem(key, v);
    } catch {}
  };
  return [value, set];
}
