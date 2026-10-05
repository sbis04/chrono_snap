#!/usr/bin/env node
// Storage stage: turn curated candidates into the shipped seed dataset.
//
//   node pipeline/build.mjs [--target 150] [--approved-only]
//
// Takes every photo approved in pipeline/out/decisions.json (written by the
// curation UI), then, unless --approved-only, tops up to --target with the
// best-scoring unrejected candidates, balanced across decades and cities.
// Each image is downloaded, resized to 1600px WebP into public/photos/, and
// the answer metadata is written to functions/src/photos.json (server-only;
// the client never ships years, titles or source ids).

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { REGIONS, regionOf } from "./regions.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const OUT = path.join(here, "out");
const PHOTO_DIR = path.join(root, "public", "photos");
const DATASET = path.join(root, "functions", "src", "photos.json");
const UA = "ChronoSnapIngest/0.1 (team icebreaker game; contact: souvik@flutterflow.io)";

const argv = process.argv.slice(2);
const TARGET = Number(argv[argv.indexOf("--target") + 1]) || 150;
const APPROVED_ONLY = argv.includes("--approved-only");
const MAX_PER_DECADE = Math.ceil(TARGET / 15); // 1880s → 2020s
const MAX_PER_CITY_DECADE = 2;

const readJson = async (f, fallback) => {
  try {
    return JSON.parse(await fs.readFile(f, "utf8"));
  } catch {
    return fallback;
  }
};

// Opaque public id: room docs expose photo ids to players, so they must not be
// reversible to a Commons page id (which would leak the year).
const SALT = "chronosnap-v1";
const publicId = (sourceId) => crypto.createHash("sha256").update(SALT + sourceId).digest("hex").slice(0, 12);

const candidates = await readJson(path.join(OUT, "candidates.json"), []);
const decisions = await readJson(path.join(OUT, "decisions.json"), {});
if (!candidates.length) {
  console.error("No candidates. Run `npm run pipeline:fetch` first.");
  process.exit(1);
}

// Late-added filters applied here too so old candidate files benefit, plus
// near-duplicate removal (same base title = same scene shot twice).
const EXCLUDE =
  /stereo|lantern slide|elevation|plaque|close-?up|detail|\bHAER\b|\bHABS\b|aerial view|negative|interior|painting|engraving|lithograph|food|dish|menu|photo essay|chalk sign|\bfig(ure|\.)\s*\d+/i;
const baseTitle = (t) => t.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z]+/g, " ").trim();
const seenTitles = new Set();
const deduped = candidates.filter((c) => {
  if (decisions[c.id]?.status === "approved") return true;
  if (EXCLUDE.test(`${c.title} ${c.description}`)) return false;
  // One auto-picked photo per city per year avoids series shots of the same event.
  const key = baseTitle(c.title);
  const cityYear = `${c.location}|${c.year}`;
  if (seenTitles.has(key) || seenTitles.has(cityYear)) return false;
  seenTitles.add(key);
  seenTitles.add(cityYear);
  return true;
});

const approved = candidates.filter((c) => decisions[c.id]?.status === "approved");
const selected = [...approved];
if (!APPROVED_ONLY) {
  const perDecade = {};
  const perCityDecade = {};
  for (const c of selected) {
    const d = Math.floor(c.year / 10);
    perDecade[d] = (perDecade[d] ?? 0) + 1;
    perCityDecade[`${c.location}|${d}`] = (perCityDecade[`${c.location}|${d}`] ?? 0) + 1;
  }
  // Balance by decade AND region: decades are filled round-robin, and within a
  // decade picks rotate through regions, so each region competes only against
  // itself. (The keyword score favours wordy English captions, so outside North
  // America a zero score is acceptable.)
  const pool = deduped.filter((c) => {
    if (decisions[c.id]) return false;
    const region = c.region ?? regionOf(c.location);
    return c.score >= 1 || (region !== "North America" && c.score >= 0);
  });
  const buckets = new Map(); // decade -> region -> candidates (best first)
  for (const c of pool) {
    const d = Math.floor(c.year / 10);
    const region = c.region ?? regionOf(c.location);
    if (!buckets.has(d)) buckets.set(d, new Map(REGIONS.map((r) => [r, []])));
    buckets.get(d).get(region).push(c);
  }
  for (const byRegion of buckets.values()) for (const list of byRegion.values()) list.sort((a, b) => b.score - a.score || b.width - a.width);
  const rotation = new Map([...buckets.keys()].map((d) => [d, d % REGIONS.length]));

  let progressed = true;
  while (selected.length < TARGET && progressed) {
    progressed = false;
    for (const d of [...buckets.keys()].sort((a, b) => a - b)) {
      if (selected.length >= TARGET) break;
      if ((perDecade[d] ?? 0) >= MAX_PER_DECADE) continue;
      const byRegion = buckets.get(d);
      for (let tries = 0; tries < REGIONS.length; tries++) {
        const region = REGIONS[rotation.get(d) % REGIONS.length];
        rotation.set(d, rotation.get(d) + 1);
        const list = byRegion.get(region);
        let picked = null;
        while (list.length && !picked) {
          const c = list.shift();
          if ((perCityDecade[`${c.location}|${d}`] ?? 0) < MAX_PER_CITY_DECADE) picked = c;
        }
        if (!picked) continue;
        selected.push(picked);
        perDecade[d] = (perDecade[d] ?? 0) + 1;
        perCityDecade[`${picked.location}|${d}`] = (perCityDecade[`${picked.location}|${d}`] ?? 0) + 1;
        progressed = true;
        break;
      }
    }
  }
}

console.log(`Building ${selected.length} photos (${approved.length} hand-approved)…`);
await fs.mkdir(PHOTO_DIR, { recursive: true });

async function download(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    throw new Error(`HTTP ${res.status}`);
  }
  throw new Error("gave up");
}

// Archive titles are often catalog ids or carry trailing accession numbers.
function cleanTitle(raw, location) {
  let t = raw
    .replace(/\((?:[A-Z]{2,5}[- ]?)?[\d-]{4,}\)/g, "") // (CHS-6358), (23399378513)
    .replace(/\((?:NYPL|LOC)[^)]*\)/gi, "")
    .replace(/[_]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[,;:\-–]+$/, "")
    .trim();
  const words = t.match(/[A-Za-zÀ-ÿ]{3,}/g) ?? [];
  if (words.length < 2) t = location ? `Street life in ${location}` : "Street scene";
  return t.length > 110 ? `${t.slice(0, 107).trimEnd()}…` : t;
}

const dataset = [];
const existingFiles = await fs.readdir(PHOTO_DIR);
let i = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (i < selected.length) {
      const c = selected[i++];
      const id = publicId(c.id);
      try {
        // Published as {id}.{contentHash}.webp so the year-long immutable CDN
        // cache can never serve a stale image after a re-crop or re-encode.
        let webp = null;
        const existing = existingFiles.find((f) => f === `${id}.webp` || (f.startsWith(`${id}.`) && f.endsWith(".webp")));
        if (existing) webp = await fs.readFile(path.join(PHOTO_DIR, existing));
        if (!webp) {
          const buf = await download(c.imageUrl);
          // Trim a 4% border: archive scans often carry handwritten dates,
          // catalog numbers or black film edges right at the margins.
          const oriented = await sharp(buf).rotate().toBuffer({ resolveWithObject: true });
          const { width: w, height: h } = oriented.info;
          const inset = { left: Math.round(w * 0.04), top: Math.round(h * 0.04), width: Math.round(w * 0.92), height: Math.round(h * 0.92) };
          webp = await sharp(oriented.data).extract(inset).resize({ width: 1600, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 76 }).toBuffer();
        }
        const meta = await sharp(webp).metadata();
        const fileName = `${id}.${crypto.createHash("sha256").update(webp).digest("hex").slice(0, 8)}.webp`;
        if (existing !== fileName) {
          await fs.writeFile(path.join(PHOTO_DIR, fileName), webp);
          if (existing) await fs.unlink(path.join(PHOTO_DIR, existing));
        }
        const d = decisions[c.id] ?? {};
        dataset.push({
          id,
          src: `/photos/${fileName}`,
          w: meta.width,
          h: meta.height,
          year: c.year,
          title: d.title || cleanTitle(c.title, c.location),
          location: d.location || c.location,
          region: c.region ?? regionOf(c.location),
          source: c.provider,
          credit: c.credit,
          license: c.license,
          sourceUrl: c.sourceUrl,
          clues: d.clues ?? [],
          sourceId: c.id,
          verified: d.status === "approved",
        });
        process.stdout.write(".");
      } catch (e) {
        console.warn(`\n  skip ${c.id}: ${e.message}`);
      }
    }
  }),
);

dataset.sort((a, b) => a.year - b.year);
await fs.writeFile(DATASET, JSON.stringify(dataset, null, 2));

// Remove images that are no longer part of the dataset.
const keep = new Set(dataset.map((p) => p.src.replace("/photos/", "")));
for (const f of await fs.readdir(PHOTO_DIR)) if (f.endsWith(".webp") && !keep.has(f)) await fs.unlink(path.join(PHOTO_DIR, f));

const byDecade = {};
for (const p of dataset) byDecade[`${Math.floor(p.year / 10) * 10}s`] = (byDecade[`${Math.floor(p.year / 10) * 10}s`] ?? 0) + 1;
console.log(`\n\n${dataset.length} photos → functions/src/photos.json + public/photos/`);
console.table(byDecade);
const byRegion = {};
for (const p of dataset) byRegion[p.region] = (byRegion[p.region] ?? 0) + 1;
console.table(byRegion);
