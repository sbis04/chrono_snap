import { useLayoutEffect, useRef } from "react";

export interface Row {
  uid: string;
  name: string;
  score: number;
  delta?: number;
  sub?: string;
}

/** Ranked list that FLIP-animates rows into their new places when scores change. */
export function Leaderboard({ rows, highlight, compact = false, startRank = 1 }: { rows: Row[]; highlight?: string; compact?: boolean; startRank?: number }) {
  const refs = useRef(new Map<string, HTMLLIElement>());
  const prevTops = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const next = new Map<string, number>();
    refs.current.forEach((el, uid) => {
      const top = el.getBoundingClientRect().top;
      next.set(uid, top);
      const prev = prevTops.current.get(uid);
      if (prev !== undefined && Math.abs(prev - top) > 1) {
        el.animate([{ transform: `translateY(${prev - top}px)` }, { transform: "translateY(0)" }], {
          duration: 700,
          easing: "cubic-bezier(.2,.8,.2,1)",
        });
      }
    });
    prevTops.current = next;
  });

  return (
    <ol className={`leaderboard ${compact ? "is-compact" : ""}`}>
      {rows.map((r, i) => (
        <li
          key={r.uid}
          ref={(el) => {
            if (el) refs.current.set(r.uid, el);
            else refs.current.delete(r.uid);
          }}
          className={`lb-row ${r.uid === highlight ? "is-me" : ""} ${i + startRank === 1 ? "is-first" : ""}`}
        >
          <span className="lb-rank">{i + startRank}</span>
          <span className="lb-name">
            {r.name}
            {r.sub && <small>{r.sub}</small>}
          </span>
          {r.delta !== undefined && <span className={`lb-delta ${r.delta === 0 ? "is-zero" : ""}`}>+{r.delta.toLocaleString()}</span>}
          <span className="lb-score">{r.score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}
