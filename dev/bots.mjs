#!/usr/bin/env node
// Dev-only: add simulated players to a room. Each bot joins, then locks in a
// guess a few seconds into every round.
//
//   node dev/bots.mjs ABCD [count=8]          # local emulators
//   node dev/bots.mjs ABCD 8 --prod           # real project from .env.local (e.g. for screenshots)

import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInAnonymously, inMemoryPersistence, setPersistence } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import fs from "node:fs";

const PROD = process.argv.includes("--prod");
const env = PROD
  ? Object.fromEntries(
      fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
        .split("\n").filter((l) => l.includes("=")).map((l) => l.split("=").map((x) => x.trim())),
    )
  : {};
const config = PROD
  ? { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID }
  : { apiKey: "demo-key", projectId: "demo-chronosnap" };

const code = (process.argv[2] ?? "").toUpperCase();
const count = Number(process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : 8);
if (!/^[A-Z]{4}$/.test(code)) {
  console.error("usage: node dev/bots.mjs ROOM [count]");
  process.exit(1);
}

const NAMES = ["Priya", "Lukas", "Emma", "Arjun", "Mei", "James", "Sofía", "Kenji", "Aisha", "Oliver", "Ananya", "Mateo", "Chloé", "Rahul"];

async function bot(i) {
  const app = initializeApp(config, `bot-${i}`);
  const auth = getAuth(app);
  await setPersistence(auth, inMemoryPersistence);
  const db = getFirestore(app);
  if (!PROD) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
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
