import { MIN_YEAR, MAX_YEAR, type RoundResult } from "../types";

const pct = (y: number) => ((y - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;

/** Horizontal 1880→now axis with every player's guess pinned and the true year struck in red. */
export function Timeline({ result }: { result: RoundResult }) {
  const actual = result.photo.year;
  const guesses = Object.entries(result.players)
    .filter(([, p]) => p.year !== null)
    .map(([uid, p]) => ({ uid, name: p.name, year: p.year as number, points: p.points }))
    .sort((a, b) => a.year - b.year);

  // Stack pins into rows so close guesses don't overlap.
  const rowsLastPct: number[] = [];
  const placed = guesses.map((g) => {
    const x = pct(g.year);
    let row = rowsLastPct.findIndex((last) => x - last > 7);
    if (row === -1) {
      row = rowsLastPct.length;
      rowsLastPct.push(x);
    } else rowsLastPct[row] = x;
    return { ...g, x, row };
  });

  // Axis labels every 20 years, skipping any that would collide with the answer label.
  const decades = [];
  for (let y = 1900; y <= MAX_YEAR - 5; y += 20) if (Math.abs(pct(y) - pct(actual)) > 7) decades.push(y);

  return (
    <div className="timeline" style={{ ["--rows" as string]: Math.max(1, rowsLastPct.length) }}>
      <div className="timeline-pins">
        {placed.map((g, i) => (
          <div
            key={g.uid}
            className={`pin ${g.year === actual ? "pin-exact" : ""}`}
            style={{ left: `${g.x}%`, bottom: `${g.row * 46}px`, animationDelay: `${600 + i * 120}ms` }}
          >
            <span className="pin-name">{g.name}</span>
            <span className="pin-year">{g.year}</span>
          </div>
        ))}
      </div>
      <div className="timeline-axis">
        {decades.map((y) => (
          <span key={y} className="timeline-tick" style={{ left: `${pct(y)}%` }}>
            {y}
          </span>
        ))}
        <div className="timeline-actual" style={{ left: `${pct(actual)}%` }}>
          <span>{actual}</span>
        </div>
      </div>
    </div>
  );
}
