#!/usr/bin/env node
// Dev-only: add simulated players to a room on the local emulators. Each bot
// joins, then locks in a guess a few seconds into every round.
//
//   node dev/bots.mjs ABCD [count=8]

import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInAnonymously, inMemoryPersistence, setPersistence } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";

const code = (process.argv[2] ?? "").toUpperCase();
const count = Number(process.argv[3] ?? 8);
if (!/^[A-Z]{4}$/.test(code)) {
  console.error("usage: node dev/bots.mjs ROOM [count]");
  process.exit(1);
}

const NAMES = ["Ada", "Alan", "Hedy", "Katherine", "Tim", "Margaret", "Dennis", "Barbara", "Ken", "Radia", "Vint", "Frances", "Guido", "Anita"];

async function bot(i) {
  const app = initializeApp({ apiKey: "demo-key", projectId: "demo-chronosnap" }, `bot-${i}`);
  const auth = getAuth(app);
  await setPersistence(auth, inMemoryPersistence);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const { user } = await signInAnonymously(auth);
  const name = NAMES[i % NAMES.length];
  await setDoc(doc(db, "rooms", code, "players", user.uid), { name, score: 0, lockedRound: -1, joinedAt: serverTimestamp() });
  console.log(`${name} joined`);

  let lastRound = -1;
  onSnapshot(doc(db, "rooms", code), (snap) => {
    const room = snap.data();
    if (!room || room.status !== "guessing" || room.currentRound === lastRound) return;
    lastRound = room.currentRound;
    const delay = 2000 + Math.random() * 8000;
    setTimeout(async () => {
      const year = Math.round(1880 + Math.random() * 140);
      try {
        await setDoc(doc(db, "rooms", code, "guesses", `${room.currentRound}_${user.uid}`), {
          uid: user.uid, round: room.currentRound, year, at: serverTimestamp(),
        });
        console.log(`${name} guessed ${year} (round ${room.currentRound + 1})`);
      } catch (e) {
        console.log(`${name} missed round ${room.currentRound + 1}: ${e.code}`);
      }
    }, delay);
  });
}

await Promise.all(Array.from({ length: count }, (_, i) => bot(i)));
console.log(`${count} bots in room ${code}. Ctrl+C to stop.`);
