import type { Timestamp } from "firebase/firestore";

export type RoomStatus = "lobby" | "guessing" | "reveal" | "finished";

export interface Room {
  code: string;
  hostUid: string;
  status: RoomStatus;
  settings: { totalRounds: number; roundSeconds: number; autoAdvanceSeconds: number };
  photoIds: string[];
  currentRound: number;
  roundEndsAt: Timestamp | null;
  nextAt: Timestamp | null;
  photo: { src: string; w: number; h: number } | null;
}

export interface Player {
  uid: string;
  name: string;
  score: number;
  lockedRound: number;
}

export interface RoundResult {
  round: number;
  photo: {
    src: string;
    year: number;
    title: string;
    location: string;
    source: string;
    credit: string;
    license: string;
    sourceUrl: string;
    clues: string[];
  };
  players: Record<string, { name: string; year: number | null; points: number; total: number }>;
}

export const MIN_YEAR = 1880;
export const MAX_YEAR = new Date().getFullYear();
