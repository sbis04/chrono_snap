#!/usr/bin/env node
// Extraction + quality filter stage of the ChronoSnap ingestion pipeline.
//
//   node pipeline/fetch.mjs [--from 1880] [--to 2023] [--sources wikimedia,loc]
//
// Queries open-access archives, keeps only photos with a verified single-year
// date, an open licence, landscape orientation and enough resolution, scores
// them for "street scene" relevance and writes pipeline/out/candidates.json.
// Responses are cached in pipeline/out/cache so reruns are cheap.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { CITY_REGION, COUNTRY_REGION, regionOf } from "./regions.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out");
const CACHE = path.join(OUT, "cache");
const UA = "ChronoSnapIngest/0.1 (team icebreaker game; contact: souvik@flutterflow.io)";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const FROM = Number(args.from ?? 1880);
const TO = Number(args.to ?? 2023);
const SOURCES = (args.sources ?? "wikimedia,loc").split(",");

const MIN_WIDTH = 1200;
const MIN_ASPECT = 1.15;
const THUMB_WIDTH = 1600;

const CITIES = Object.keys(CITY_REGION);
// The original 22 cities are also searched year-by-year (already cached).
const YEAR_CITIES = [
  "New York City", "London", "Paris", "Chicago", "San Francisco", "Los Angeles", "Tokyo",
  "Berlin", "Amsterdam", "Toronto", "Sydney", "Boston", "Washington, D.C.", "Stockholm",
  "Copenhagen", "Helsinki", "Vienna", "Rome", "Mumbai", "Kolkata", "Hong Kong", "Seoul",
];

const GOOD_WORDS = [
  "street", "avenue", "road", "traffic", "square", "market", "parade", "shop", "store", "downtown",
  "crowd", "bus", "tram", "streetcar", "trolley", "station", "boulevard", "broadway", "cars", "car",
  "taxi", "storefront", "sidewalk", "intersection", "corner", "people", "pedestrians", "cinema",
  "theatre", "theater", "diner", "restaurant", "bazaar", "festival", "protest", "demonstration",
  "fair", "beach", "harbour", "harbor", "rally", "strasse", "straße", "rue", "gatan", "calle",
];
const BAD_WORDS = [
  "map", "plan", "logo", "coat of arms", "flag", "diagram", "document", "letter", "newspaper",
  "page", "poster", "stamp", "coin", "portrait", "signature", "chart", "cover", "menu", "ticket",
  "postcard", "painting", "drawing", "illustration", "engraving", "sketch", "lithograph",
  "screenshot", "album", "scan", "certificate", "medal", "manuscript", "watercolor", "watercolour",
  "headshot", "mugshot", "stereo", "stereograph", "stereoview", "stereoscopic", "lantern slide", "glass plate negative envelope", "x-ray", "microscope", "specimen", "grave", "tomb", "interior of",
];
const OPEN_LICENSE = /^(public domain|pd|cc0|no restrictions|no known copyright|cc by(-sa)? ?[0-9.]*|cc-by)/i;
const FUZZY_DATE = /\b(circa|ca\.?|c\.|about|approx|approximately|before|after|between|or|probably|possibly|unknown|undated|\d{4}s)\b|\?/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripHtml = (s = "") => s.replace(/<div[^>]*display:\s*none[^>]*>.*?<\/div>/gis, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

async function cachedJson(url) {
  const key = crypto.createHash("sha1").update(url).digest("hex");
  const file = path.join(CACHE, `${key}.json`);
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {}
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { status: res.status });
    const text = await res.text();
    if (text.trimStart().startsWith("<")) throw Object.assign(new Error(`Non-JSON (bot challenge?) for ${url}`), { status: 403 });
    const json = JSON.parse(text);
    await fs.writeFile(file, JSON.stringify(json));
    return json;
  }
  throw new Error(`Gave up on ${url}`);
}

/** Exactly one distinct 4-digit year, equal to `expected` if given, and no fuzzy qualifiers. */
function verifiedYear(raw, expected) {
  const text = stripHtml(raw);
  if (!text || FUZZY_DATE.test(text)) return null;
  const years = [...new Set(text.match(/\b(18[89]\d|19\d\d|20[0-2]\d)\b/g) ?? [])].map(Number);
  if (years.length !== 1) return null;
  if (expected !== undefined && years[0] !== expected) return null;
  return years[0];
}

function relevance(text) {
  const t = ` ${text.toLowerCase()} `;
  if (BAD_WORDS.some((w) => t.includes(w))) return -1;
  return GOOD_WORDS.reduce((s, w) => s + (new RegExp(`\\b${w}\\b`).test(t) ? 1 : 0), 0);
}

async function pool(items, concurrency, fn) {
  let i = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (i < items.length) {
        const item = items[i++];
        await fn(item);
        if (++done % 50 === 0) process.stdout.write(`  ${done}/${items.length}\n`);
      }
    }),
  );
}

// ---------- Wikimedia Commons: "Category:{year} in {city}" year trees ----------
async function fetchWikimedia() {
  // Year categories for the original core cities (dense, cached), plus decade
  // categories for every city — far fewer queries for broad world coverage.
  // The exact year is still verified per photo from its own date metadata.
  const jobs = [];
  for (let y = FROM; y <= TO; y++) for (const city of YEAR_CITIES) jobs.push({ year: y, city });
  for (let d = Math.floor(FROM / 10) * 10; d <= TO; d += 10) for (const city of CITIES) jobs.push({ decade: d, city });
  for (const country of Object.keys(COUNTRY_REGION)) {
    for (let y = FROM; y <= TO; y++) jobs.push({ year: y, city: country, title: `Category:${y} in ${country}` });
    for (let d = Math.floor(FROM / 10) * 10; d <= TO; d += 10) {
      jobs.push({ decade: d, city: country, title: `Category:${d}s photographs of ${country}` });
    }
  }
  console.log(`Wikimedia: ${jobs.length} category queries`);
  const out = [];
  await pool(jobs, 10, async ({ year, decade, city, title }) => {
    const params = new URLSearchParams({
      action: "query", format: "json", generator: "categorymembers",
      gcmtitle: title ?? (year !== undefined ? `Category:${year} in ${city}` : `Category:${decade}s in ${city}`),
      gcmtype: "file", gcmlimit: "100",
      prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: String(THUMB_WIDTH),
      iiextmetadatafilter: "DateTimeOriginal|LicenseShortName|ImageDescription|Artist|ObjectName",
    });
    let data;
    try {
      data = await cachedJson(`https://commons.wikimedia.org/w/api.php?${params}`);
    } catch (e) {
      console.warn(`  skip ${year ?? decade + "s"} ${city}: ${e.message}`);
      return;
    }
    for (const page of Object.values(data?.query?.pages ?? {})) {
      const info = page.imageinfo?.[0];
      if (!info || !["image/jpeg", "image/tiff"].includes(info.mime)) continue;
      if (info.width < MIN_WIDTH || info.width / info.height < MIN_ASPECT) continue;
      const meta = info.extmetadata ?? {};
      const license = stripHtml(meta.LicenseShortName?.value);
      if (!OPEN_LICENSE.test(license)) continue;
      const exact = verifiedYear(meta.DateTimeOriginal?.value, year);
      if (exact === null || (decade !== undefined && Math.floor(exact / 10) * 10 !== decade)) continue;
      const title = stripHtml(meta.ObjectName?.value) || page.title.replace(/^File:/, "").replace(/\.\w+$/, "");
      const description = stripHtml(meta.ImageDescription?.value).slice(0, 600);
      const score = relevance(`${title} ${description}`);
      if (score < 0) continue;
      out.push({
        id: `wm_${page.pageid}`,
        provider: "Wikimedia Commons",
        year: exact,
        title,
        description,
        location: city.replace(/^(Bombay)$/, "Mumbai").replace(/^Calcutta$/, "Kolkata").replace(/^Madras$/, "Chennai"),
        region: regionOf(city),
        width: info.width,
        height: info.height,
        imageUrl: info.thumburl ?? info.url,
        sourceUrl: info.descriptionurl,
        credit: stripHtml(meta.Artist?.value).slice(0, 120) || "Unknown",
        license,
        score: score + (info.width >= 2000 ? 1 : 0),
      });
    }
  });
  return out;
}

// ---------- Library of Congress: free-to-use photos per decade ----------
async function fetchLoc() {
  const out = [];
  const queries = ["street scene", "traffic", "downtown", "parade", "storefront", "main street"];
  for (let decade = Math.floor(FROM / 10) * 10; decade <= TO; decade += 10) {
    for (const q of queries) {
      const params = new URLSearchParams({
        q, fo: "json", c: "100", dates: `${decade}/${decade + 9}`, fa: "online-format:image|access-restricted:false",
      });
      let data;
      try {
        data = await cachedJson(`https://www.loc.gov/photos/?${params}`);
      } catch (e) {
        if (e.status === 403) {
          console.warn("LOC: blocked by bot protection from this network, skipping source.");
          return out;
        }
        console.warn(`  LOC skip ${decade} ${q}: ${e.message}`);
        continue;
      }
      for (const item of data?.results ?? []) {
        const exact = verifiedYear(String(item.date ?? ""));
        if (exact === null || exact < FROM || exact > TO) continue;
        const rights = String(item.rights_advisory ?? item.rights ?? "");
        if (rights && !/no known restrictions/i.test(rights)) continue;
        const imageUrl = [...(item.image_url ?? [])].pop();
        if (!imageUrl) continue;
        const title = stripHtml(String(item.title ?? ""));
        const score = relevance(`${title} ${(item.subject ?? []).join(" ")}`);
        if (score < 0) continue;
        out.push({
          id: `loc_${String(item.id ?? item.url).split("/").filter(Boolean).pop()}`,
          provider: "Library of Congress",
          year: exact,
          title,
          description: stripHtml(String(item.description ?? "")).slice(0, 600),
          location: (item.location ?? [])[0] ?? "",
          width: 0,
          height: 0,
          imageUrl: imageUrl.split("#")[0],
          sourceUrl: item.url ?? item.id,
          credit: (item.contributor ?? [])[0] ?? "Library of Congress",
          license: "No known restrictions",
          score,
        });
      }
      await sleep(400);
    }
  }
  return out;
}

await fs.mkdir(CACHE, { recursive: true });
const all = [];
if (SOURCES.includes("wikimedia")) all.push(...(await fetchWikimedia()));
if (SOURCES.includes("loc")) all.push(...(await fetchLoc()));

const unique = [...new Map(all.map((c) => [c.id, c])).values()].sort((a, b) => b.score - a.score || a.year - b.year);
await fs.writeFile(path.join(OUT, "candidates.json"), JSON.stringify(unique, null, 2));

const byDecade = {};
for (const c of unique) byDecade[`${Math.floor(c.year / 10) * 10}s`] = (byDecade[`${Math.floor(c.year / 10) * 10}s`] ?? 0) + 1;
console.log(`\n${unique.length} candidates → pipeline/out/candidates.json`);
console.table(byDecade);
