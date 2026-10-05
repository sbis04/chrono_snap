import data from "./photos.json";

export interface Photo {
  id: string;
  src: string;
  w: number;
  h: number;
  year: number;
  title: string;
  location: string;
  /** e.g. "South Asia", "Europe" — used to keep each game geographically mixed. */
  region?: string;
  source: string;
  credit: string;
  license: string;
  sourceUrl: string;
  clues: string[];
}

export const PHOTOS: Photo[] = data as Photo[];

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pick `count` photos, preferring ones not in `recentIds`, and spreading picks
 * across decades and world regions so a game isn't five 1960s US street scenes.
 * Passes (unplayed photos first): new decade + new region, then new decade, then anything.
 */
export function pickPhotos(pool: Photo[], count: number, recentIds: string[]): Photo[] {
  const recent = new Set(recentIds);
  const fresh = shuffle(pool.filter((p) => !recent.has(p.id)));
  const stale = shuffle(pool.filter((p) => recent.has(p.id)));

  const picked: Photo[] = [];
  const decades = new Set<number>();
  const regions = new Set<string>();
  const take = (from: Photo[], accept: (p: Photo) => boolean) => {
    for (const p of from) {
      if (picked.length >= count) return;
      if (picked.includes(p) || !accept(p)) continue;
      picked.push(p);
      decades.add(Math.floor(p.year / 10));
      regions.add(p.region ?? "");
    }
  };
  // Freshness beats variety: exhaust unplayed photos before reusing any.
  for (const from of [fresh, stale]) {
    take(from, (p) => !decades.has(Math.floor(p.year / 10)) && !regions.has(p.region ?? ""));
    take(from, (p) => !decades.has(Math.floor(p.year / 10)));
    take(from, () => true);
  }
  return shuffle(picked);
}
