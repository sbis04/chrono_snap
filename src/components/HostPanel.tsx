import { useState } from "react";
import { api } from "../firebase";
import { startOrAdvance } from "../game";
import type { Player, Room } from "../types";

/**
 * The room creator's controls, reachable from the top bar at every stage:
 * start, end the round early, move on, end the game, remove players.
 */
export function HostPanel({ room, players, meUid, onClose }: { room: Room; players: Player[]; meUid: string; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [error, setError] = useState("");
  const isLast = room.currentRound + 1 >= room.settings.totalRounds;
  const inGame = room.status === "guessing" || room.status === "reveal";

  const run = (key: string, fn: () => Promise<unknown>, close = true) => async () => {
    setBusy(key);
    setError("");
    try {
      await fn();
      if (close) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" role="dialog" aria-label="Host controls" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <header className="sheet-head">
          <span className="label">Host controls · room {room.code}</span>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="sheet-actions">
          {room.status === "lobby" && (
            <button className="btn btn-primary" disabled={!!busy} onClick={run("start", () => startOrAdvance(room.code))}>
              {busy === "start" ? "Loading film…" : `Start game · ${players.length} ${players.length === 1 ? "player" : "players"}`}
            </button>
          )}
          {room.status === "guessing" && (
            <button
              className="btn btn-primary"
              disabled={!!busy}
              onClick={run("reveal", () => api.revealRound({ code: room.code, round: room.currentRound, force: true }))}
            >
              {busy === "reveal" ? "Revealing…" : "End round now & reveal"}
            </button>
          )}
          {room.status === "reveal" && (
            <button className="btn btn-primary" disabled={!!busy} onClick={run("next", () => startOrAdvance(room.code))}>
              {busy === "next" ? "Loading film…" : isLast ? "Show final standings" : "Next photo now"}
            </button>
          )}
          {room.status === "finished" && (
            <button className="btn btn-primary" disabled={!!busy} onClick={run("again", () => api.resetRoom({ code: room.code }))}>
              Play again with this crew
            </button>
          )}

          {inGame &&
            (confirmEnd ? (
              <div className="confirm-row">
                <span>End the game for everyone?</span>
                <button className="btn btn-danger" disabled={!!busy} onClick={run("end", () => api.endGame({ code: room.code }))}>
                  {busy === "end" ? "Ending…" : "Yes, end it"}
                </button>
                <button className="btn btn-ghost" onClick={() => setConfirmEnd(false)}>
                  Keep playing
                </button>
              </div>
            ) : (
              <button className="btn btn-ghost" onClick={() => setConfirmEnd(true)}>
                End game early
              </button>
            ))}
        </div>

        <div className="sheet-section">
          <span className="label">
            Players · {players.length}
            {room.status === "guessing" && ` · ${players.filter((p) => p.lockedRound === room.currentRound).length} locked in`}
          </span>
          <ul className="sheet-players">
            {players.map((p) => (
              <li key={p.uid}>
                <span className={`dot ${room.status === "guessing" && p.lockedRound === room.currentRound ? "is-locked" : ""}`} />
                <span className="sheet-player-name">
                  {p.name}
                  {p.uid === meUid && <small> (you)</small>}
                </span>
                <span className="sheet-player-score">{p.score.toLocaleString()}</span>
                {p.uid !== meUid && (
                  <button
                    className="sheet-kick"
                    aria-label={`Remove ${p.name}`}
                    disabled={!!busy}
                    onClick={run(`kick-${p.uid}`, () => api.kickPlayer({ code: room.code, playerUid: p.uid }), false)}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <a className="sheet-link" href={`/host/${room.code}`} target="_blank" rel="noreferrer">
          Open big-screen view ↗
        </a>
        {error && <p className="error">{error}</p>}
      </section>
    </div>
  );
}
