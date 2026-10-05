import { useCountdown } from "../hooks";
import type { Room } from "../types";

/** "Next photo in 12s" ticker shown during auto-advancing reveals. */
export function NextCountdown({ room }: { room: Room }) {
  const nextAtMs = room.status === "reveal" ? room.nextAt?.toMillis() ?? null : null;
  const left = useCountdown(nextAtMs);
  if (!nextAtMs) return null;
  const total = room.settings.autoAdvanceSeconds * 1000;
  const isLast = room.currentRound + 1 >= room.settings.totalRounds;
  return (
    <div className="next-countdown" role="timer">
      <span className="next-countdown-bar" style={{ transform: `scaleX(${total ? left / total : 0})` }} />
      <span>
        {isLast ? "Final standings" : "Next photo"} in <b>{Math.ceil(left / 1000)}</b>s
      </span>
    </div>
  );
}
