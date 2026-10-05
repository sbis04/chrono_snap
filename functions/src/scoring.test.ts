import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreGuess } from "./scoring.js";
import { pickPhotos, type Photo } from "./photos.js";

test("exponential decay matches the design doc curve", () => {
  assert.equal(scoreGuess(1968, 1968), 5000);
  assert.equal(scoreGuess(1968, 1969), 4303);
  assert.equal(scoreGuess(1968, 1965), 3188);
  assert.equal(scoreGuess(1968, 1973), 2361);
  assert.equal(scoreGuess(1968, 1958), 1115);
  assert.equal(scoreGuess(1968, 1943), 117);
  assert.equal(scoreGuess(1968, 1880), 0);
});

test("pickPhotos returns distinct photos spread across decades", () => {
  const pool: Photo[] = [];
  for (let y = 1900; y < 2000; y += 2) {
    pool.push({ id: `p${y}`, src: "", w: 1, h: 1, year: y, title: "", location: "", source: "", credit: "", license: "", sourceUrl: "", clues: [] });
  }
  const picked = pickPhotos(pool, 8, []);
  assert.equal(picked.length, 8);
  assert.equal(new Set(picked.map((p) => p.id)).size, 8);
  assert.equal(new Set(picked.map((p) => Math.floor(p.year / 10))).size, 8);
  const excluded = pickPhotos(pool, 5, pool.slice(0, 45).map((p) => p.id));
  assert.equal(excluded.length, 5, "falls back to excluded photos when the pool runs dry");
});

test("pickPhotos mixes regions when it can", () => {
  const regions = ["South Asia", "Europe", "UK & Ireland", "North America", "East Asia"];
  const pool: Photo[] = [];
  for (let y = 1900; y < 2000; y++) {
    pool.push({ id: `p${y}`, src: "", w: 1, h: 1, year: y, title: "", location: "", region: regions[y % 5], source: "", credit: "", license: "", sourceUrl: "", clues: [] });
  }
  for (let i = 0; i < 20; i++) {
    const picked = pickPhotos(pool, 5, []);
    assert.equal(new Set(picked.map((p) => p.region)).size, 5);
    assert.equal(new Set(picked.map((p) => Math.floor(p.year / 10))).size, 5);
  }
});

test("pickPhotos order is unbiased (no oldest-first pattern)", () => {
  const pool: Photo[] = [];
  for (let y = 1880; y < 2030; y++) {
    pool.push({ id: `p${y}`, src: "", w: 1, h: 1, year: y, title: "", location: "", source: "", credit: "", license: "", sourceUrl: "", clues: [] });
  }
  const runs = 3000;
  let firstIsOldest = 0;
  let sorted = 0;
  const firstDecade = new Map<number, number>();
  for (let i = 0; i < runs; i++) {
    const picked = pickPhotos(pool, 5, []);
    const years = picked.map((p) => p.year);
    if (years[0] === Math.min(...years)) firstIsOldest++;
    if (years.every((y, j) => j === 0 || years[j - 1] < y)) sorted++;
    const d = Math.floor(years[0] / 10);
    firstDecade.set(d, (firstDecade.get(d) ?? 0) + 1);
  }
  // Uniform order: the oldest photo comes first ~1/5 of the time, fully sorted ~1/120.
  assert.ok(Math.abs(firstIsOldest / runs - 0.2) < 0.04, `oldest-first rate ${firstIsOldest / runs}`);
  assert.ok(sorted / runs < 0.02, `sorted rate ${sorted / runs}`);
  // Every one of the 15 decades shows up as round 1 roughly equally (1/15 ≈ 200 of 3000).
  assert.equal(firstDecade.size, 15);
  for (const n of firstDecade.values()) assert.ok(n > 110 && n < 300, `decade frequency ${n}`);
});

test("pickPhotos avoids recently played photos until the pool runs dry", () => {
  const pool: Photo[] = [];
  for (let y = 1900; y < 1950; y++) {
    pool.push({ id: `p${y}`, src: "", w: 1, h: 1, year: y, title: "", location: "", source: "", credit: "", license: "", sourceUrl: "", clues: [] });
  }
  const recent = pool.slice(0, 40).map((p) => p.id);
  for (let i = 0; i < 50; i++) {
    const picked = pickPhotos(pool, 5, recent);
    assert.ok(picked.every((p) => !recent.includes(p.id)));
  }
});
