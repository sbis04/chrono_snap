import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import { logger } from "firebase-functions";
import { scoreGuess } from "./scoring.js";
import { PHOTOS, pickPhotos, type Photo } from "./photos.js";

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 20 });

const db = getFirestore();

// Grace period after the deadline so guesses in flight when the timer hits 0 still land.
const REVEAL_GRACE_MS = 1500;
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
// No I/O/0/1 so codes read cleanly off a shared screen.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

type RoomStatus = "lobby" | "guessing" | "reveal" | "finished";

interface RoomDoc {
  code: string;
  hostUid: string;
  status: RoomStatus;
  createdAt: Timestamp;
  settings: { totalRounds: number; roundSeconds: number; autoAdvanceSeconds: number };
  photoIds: string[];
  currentRound: number;
  roundEndsAt: Timestamp | null;
  /** When auto-advance will move past the current reveal (null = manual). */
  nextAt: Timestamp | null;
  /** Every photo this room has used, so "Play again" doesn't repeat photos. */
  playedIds?: string[];
  photo: { src: string; w: number; h: number } | null;
}

interface PlayerDoc {
  name: string;
  score: number;
  joinedAt: Timestamp;
  lockedRound: number;
}

interface GuessDoc {
  uid: string;
  round: number;
  year: number;
}

const roomRef = (code: string) => db.collection("rooms").doc(code);

function requireAuth(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  return req.auth.uid;
}

function parseCode(raw: unknown): string {
  const code = String(raw ?? "").toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) throw new HttpsError("invalid-argument", "Bad room code.");
  return code;
}

async function loadHostRoom(tx: Transaction, code: string, uid: string): Promise<RoomDoc> {
  const snap = await tx.get(roomRef(code));
  if (!snap.exists) throw new HttpsError("not-found", "Room not found.");
  const room = snap.data() as RoomDoc;
  if (room.hostUid !== uid) throw new HttpsError("permission-denied", "Only the host can do that.");
  return room;
}

function photoById(id: string): Photo {
  const p = PHOTOS.find((x) => x.id === id);
  if (!p) throw new HttpsError("internal", `Photo ${id} missing from dataset.`);
  return p;
}

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

export const createRoom = onCall(async (req) => {
  const uid = requireAuth(req);
  if (PHOTOS.length === 0) {
    throw new HttpsError("failed-precondition", "Photo dataset is empty. Run the ingestion pipeline.");
  }
  const totalRounds = clamp(req.data?.totalRounds, 1, Math.min(15, PHOTOS.length), 5);
  const roundSeconds = clamp(req.data?.roundSeconds, 10, 120, 40);
  const autoAdvanceSeconds = clamp(req.data?.autoAdvanceSeconds, 0, 60, 15);

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
    const created = await db.runTransaction(async (tx) => {
      const ref = roomRef(code);
      const existing = await tx.get(ref);
      if (existing.exists) return false;
      const room: RoomDoc = {
        code,
        hostUid: uid,
        status: "lobby",
        createdAt: Timestamp.now(),
        settings: { totalRounds, roundSeconds, autoAdvanceSeconds },
        photoIds: [],
        currentRound: -1,
        roundEndsAt: null,
        nextAt: null,
        photo: null,
      };
      tx.set(ref, room);
      return true;
    });
    if (created) return { code };
  }
  throw new HttpsError("resource-exhausted", "Could not allocate a room code, try again.");
});

/**
 * lobby → round 0, reveal → next round, or last reveal → finished.
 * Either the host asks (manual), or auto-advance fires for `expectRound` once
 * the room's `nextAt` has passed — the latter needs no particular caller.
 */
async function doAdvance(
  code: string,
  opts: { hostUid?: string; expectRound?: number; recentIds?: string[] },
): Promise<{ notDueUntil?: number }> {
  let notDueUntil: number | undefined;
  const result = await db.runTransaction(async (tx) => {
    notDueUntil = undefined;
    const snap = await tx.get(roomRef(code));
    if (!snap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = snap.data() as RoomDoc;
    if (opts.expectRound !== undefined) {
      if (room.status !== "reveal" || room.currentRound !== opts.expectRound || room.nextAt === null) return null;
      if (Date.now() < room.nextAt.toMillis() - 250) {
        notDueUntil = room.nextAt.toMillis();
        return null;
      }
    } else if (room.hostUid !== opts.hostUid) {
      throw new HttpsError("permission-denied", "Only the room creator can do that.");
    }
    if (room.status === "guessing") return null;
    if (room.status === "finished") throw new HttpsError("failed-precondition", "Game is over.");

    let photoIds = room.photoIds;
    let playedIds = room.playedIds ?? [];
    if (room.status === "lobby") {
      // Avoid photos this room has already seen plus the creator's recent ones.
      // pickPhotos falls back to them only if the fresh pool runs dry.
      const avoid = [...new Set([...playedIds, ...(opts.recentIds ?? [])])];
      photoIds = pickPhotos(PHOTOS, room.settings.totalRounds, avoid).map((p) => p.id);
      playedIds = [...photoIds, ...playedIds.filter((id) => !photoIds.includes(id))].slice(0, Math.max(0, PHOTOS.length - 20));
    }
    const nextRound = room.currentRound + 1;
    if (nextRound >= photoIds.length) {
      tx.update(roomRef(code), { status: "finished", roundEndsAt: null, nextAt: null });
      return null;
    }

    const photo = photoById(photoIds[nextRound]);
    const endsAtMs = Date.now() + room.settings.roundSeconds * 1000;
    tx.update(roomRef(code), {
      status: "guessing",
      photoIds,
      playedIds,
      currentRound: nextRound,
      roundEndsAt: Timestamp.fromMillis(endsAtMs),
      nextAt: null,
      photo: { src: photo.src, w: photo.w, h: photo.h },
    });
    return { round: nextRound, endsAtMs };
  });

  if (result) {
    // Server-side timer. If enqueueing fails, clients' fallback calls to
    // revealRound still end the round, so log rather than fail the request.
    await enqueue("revealRoundTask", { code, round: result.round }, result.endsAtMs + REVEAL_GRACE_MS);
  }
  return { notDueUntil };
}

async function enqueue(queue: string, data: Record<string, unknown>, atMs: number) {
  try {
    await getFunctions().taskQueue(queue).enqueue(data, { scheduleTime: new Date(atMs) });
  } catch (err) {
    logger.warn(`Failed to enqueue ${queue}`, { data, err });
  }
}

/** Host: advance now. Anyone: `{ auto: true, round }` nudges a due auto-advance (fallback for the task). */
export const advance = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = parseCode(req.data?.code);
  const recentIds = Array.isArray(req.data?.recentIds) ? req.data.recentIds.map(String).slice(0, 200) : [];
  if (req.data?.auto === true) {
    await doAdvance(code, { expectRound: clamp(req.data?.round, 0, 100, -1), recentIds });
  } else {
    await doAdvance(code, { hostUid: uid, recentIds });
  }
  return { ok: true };
});

const TASK_OPTS = {
  retryConfig: { maxAttempts: 3, minBackoffSeconds: 2 },
  rateLimits: { maxConcurrentDispatches: 50 },
  timeoutSeconds: 180,
};
const MAX_IN_TASK_WAIT_MS = 130_000; // > longest round (120s) + grace
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a timed transition. If the task was delivered before it was due (the
 * local Cloud Tasks emulator ignores scheduleTime), wait it out in-process
 * rather than re-enqueueing, then try once more. Production tasks arrive on
 * time, so the wait is normally zero.
 */
async function runWhenDue(attempt: () => Promise<{ notDueUntil?: number }>) {
  const { notDueUntil } = await attempt();
  if (notDueUntil === undefined) return;
  const wait = notDueUntil - Date.now();
  if (wait > MAX_IN_TASK_WAIT_MS) {
    logger.warn("Timer task far too early; leaving it to client nudges", { wait });
    return;
  }
  await sleep(Math.max(0, wait) + 50);
  await attempt();
}

export const advanceRoundTask = onTaskDispatched(TASK_OPTS, async (req) => {
  const code = parseCode(req.data?.code);
  const round = Number(req.data?.round);
  await runWhenDue(() => doAdvance(code, { expectRound: round }));
});

/**
 * Score the round and flip the room to "reveal". Idempotent: a no-op unless the
 * room is still guessing on `round`. Without `force`, it only reveals once the
 * deadline has passed or every player has locked in.
 */
async function doReveal(
  code: string,
  round: number,
  opts: { force?: boolean; hostUid?: string } = {},
): Promise<{ notDueUntil?: number }> {
  let notDueUntil: number | undefined;
  const nextAtMs = await db.runTransaction(async (tx): Promise<number | null> => {
    notDueUntil = undefined;
    const ref = roomRef(code);
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const room = snap.data() as RoomDoc;
    if (opts.hostUid !== undefined && room.hostUid !== opts.hostUid) {
      throw new HttpsError("permission-denied", "Only the host can do that.");
    }
    if (room.status !== "guessing" || room.currentRound !== round) return null;

    const [playersSnap, guessesSnap] = await Promise.all([
      tx.get(ref.collection("players")),
      tx.get(ref.collection("guesses").where("round", "==", round)),
    ]);
    const guesses = new Map<string, GuessDoc>();
    guessesSnap.forEach((d) => {
      const g = d.data() as GuessDoc;
      guesses.set(g.uid, g);
    });

    const deadlinePassed = room.roundEndsAt !== null && Date.now() >= room.roundEndsAt.toMillis();
    const allLocked = playersSnap.size > 0 && playersSnap.docs.every((d) => guesses.has(d.id));
    if (!opts.force && !deadlinePassed && !allLocked) {
      notDueUntil = room.roundEndsAt?.toMillis();
      return null;
    }

    const photo = photoById(room.photoIds[round]);
    const scored: Record<string, { name: string; year: number | null; points: number; total: number }> = {};
    playersSnap.forEach((d) => {
      const p = d.data() as PlayerDoc;
      const g = guesses.get(d.id);
      const points = g ? scoreGuess(photo.year, g.year) : 0;
      scored[d.id] = { name: p.name, year: g ? g.year : null, points, total: p.score + points };
      if (points > 0) tx.update(d.ref, { score: FieldValue.increment(points) });
    });

    tx.set(ref.collection("results").doc(String(round)), {
      round,
      photo: {
        src: photo.src,
        year: photo.year,
        title: photo.title,
        location: photo.location,
        source: photo.source,
        credit: photo.credit,
        license: photo.license,
        sourceUrl: photo.sourceUrl,
        clues: photo.clues,
      },
      players: scored,
      revealedAt: Timestamp.now(),
    });
    const auto = room.settings.autoAdvanceSeconds ?? 0;
    const next = auto > 0 ? Date.now() + auto * 1000 : null;
    tx.update(ref, { status: "reveal", roundEndsAt: null, nextAt: next === null ? null : Timestamp.fromMillis(next) });
    return next;
  });
  if (nextAtMs !== null) await enqueue("advanceRoundTask", { code, round }, nextAtMs);
  return { notDueUntil };
}

/**
 * Host: `force: true` ends the round now ("Reveal now"). Anyone: nudge a reveal
 * whose deadline has passed — the fallback for revealRoundTask (re-checked server-side).
 */
export const revealRound = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = parseCode(req.data?.code);
  const round = clamp(req.data?.round, 0, 100, -1);
  const force = req.data?.force === true;
  await doReveal(code, round, force ? { force, hostUid: uid } : {});
  return { ok: true };
});

export const revealRoundTask = onTaskDispatched(TASK_OPTS, async (req) => {
  const code = parseCode(req.data?.code);
  const round = Number(req.data?.round);
  await runWhenDue(async () => {
    const r = await doReveal(code, round);
    return r.notDueUntil === undefined ? r : { notDueUntil: r.notDueUntil + REVEAL_GRACE_MS };
  });
});

/** Mark the player as locked in, and end the round early once everyone has guessed. */
export const onGuessWritten = onDocumentWritten("rooms/{code}/guesses/{guessId}", async (event) => {
  const after = event.data?.after.data() as GuessDoc | undefined;
  if (!after) return;
  const code = event.params.code;
  await roomRef(code).collection("players").doc(after.uid).update({ lockedRound: after.round }).catch(() => undefined);
  await doReveal(code, after.round);
});

/** Host-only: back to the lobby with scores reset, keeping the players. */
export const resetRoom = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = parseCode(req.data?.code);
  await db.runTransaction(async (tx) => {
    await loadHostRoom(tx, code, uid);
    const ref = roomRef(code);
    const players = await tx.get(ref.collection("players"));
    players.forEach((d) => tx.update(d.ref, { score: 0, lockedRound: -1 }));
    tx.update(ref, { status: "lobby", currentRound: -1, photoIds: [], roundEndsAt: null, nextAt: null, photo: null });
  });
  // Old guesses/results are keyed by round number, so clear them so round 0 starts clean.
  for (const sub of ["guesses", "results"]) {
    await db.recursiveDelete(roomRef(code).collection(sub));
  }
  return { ok: true };
});

/** Host-only: remove a player from the lobby/game. */
export const kickPlayer = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = parseCode(req.data?.code);
  const playerUid = String(req.data?.playerUid ?? "");
  if (playerUid === uid) throw new HttpsError("invalid-argument", "You can't remove yourself.");
  await db.runTransaction(async (tx) => {
    await loadHostRoom(tx, code, uid);
    tx.delete(roomRef(code).collection("players").doc(playerUid));
  });
  return { ok: true };
});

/** Host-only: stop the game now and go straight to final standings. An unrevealed round is not scored. */
export const endGame = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = parseCode(req.data?.code);
  await db.runTransaction(async (tx) => {
    const room = await loadHostRoom(tx, code, uid);
    if (room.status === "lobby" || room.status === "finished") return;
    tx.update(roomRef(code), { status: "finished", roundEndsAt: null, nextAt: null });
  });
  return { ok: true };
});

export const cleanupRooms = onSchedule("every 6 hours", async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - ROOM_TTL_MS);
  const stale = await db.collection("rooms").where("createdAt", "<", cutoff).limit(200).get();
  for (const doc of stale.docs) await db.recursiveDelete(doc.ref);
  logger.info(`Deleted ${stale.size} stale rooms`);
});

/** Lets clients estimate their clock offset so every countdown agrees with the server deadline. */
export const serverTime = onCall(() => ({ now: Date.now() }));
