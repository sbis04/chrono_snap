import { useEffect, useRef } from "react";
import { sfx } from "../sound";

/** Shutter-aperture style countdown ring. */
export function Countdown({ msLeft, totalMs, size = 120, sound = false }: { msLeft: number; totalMs: number; size?: number; sound?: boolean }) {
  const secs = Math.ceil(msLeft / 1000);
  const last = useRef(secs);
  useEffect(() => {
    if (sound && secs !== last.current && secs <= 5 && secs > 0) sfx.tick(secs <= 3);
    last.current = secs;
  }, [secs, sound]);

  const frac = totalMs > 0 ? Math.max(0, Math.min(1, msLeft / totalMs)) : 0;
  const r = 44;
  const circ = 2 * Math.PI * r;
  const urgent = secs <= 5;
  return (
    <div className={`countdown ${urgent ? "is-urgent" : ""}`} style={{ width: size, height: size }} role="timer" aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} className="countdown-track" />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="50" y1="2" x2="50" y2="8" className="countdown-notch" transform={`rotate(${i * 30} 50 50)`} />
        ))}
        <circle
          cx="50"
          cy="50"
          r={r}
          className="countdown-arc"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span key={urgent ? secs : "steady"} className="countdown-num">
        {secs}
      </span>
    </div>
  );
}
