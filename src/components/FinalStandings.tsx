import { useEffect, type ReactNode } from "react";
import type { Player, Room } from "../types";
import { Leaderboard } from "./Leaderboard";
import { sfx } from "../sound";

/**
 * The end-of-game screen shared by every player and the big screen: a podium
 * for the top three and the rest of the ranking, with the viewer highlighted.
 */
export function FinalStandings({ room, players, meUid, children }: { room: Room; players: Player[]; meUid?: string; children?: ReactNode }) {
  const ranked = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const myRank = meUid ? ranked.findIndex((p) => p.uid === meUid) + 1 : 0;
  const played = room.currentRound + 1;
  useEffect(() => {
    sfx.fanfare();
  }, []);
  const podium = [ranked[1], ranked[0], ranked[2]];
  return (
    <section className="finished">
      <p className="kicker">
        Final standings · {played} {played === 1 ? "photo" : "photos"}
      </p>
      <h1 className="headline">The archive has spoken</h1>
      {myRank > 0 && (
        <p className="final-you">
          {myRank === 1 ? "You won! Master of the decades." : `You finished #${myRank} of ${ranked.length}`}
        </p>
      )}
      <div className="podium">
        {podium.map((p, i) =>
          p ? (
            <div
              key={p.uid}
              className={`podium-step step-${[2, 1, 3][i]} ${p.uid === meUid ? "is-me" : ""}`}
              style={{ animationDelay: `${[400, 900, 0][i]}ms` }}
            >
              <span className="podium-name">{p.name}</span>
              <span className="podium-score">{p.score.toLocaleString()}</span>
              <div className="podium-block">
                <span>{[2, 1, 3][i]}</span>
              </div>
            </div>
          ) : (
            <div key={i} className="podium-step podium-empty" />
          ),
        )}
      </div>
      {ranked.length > 3 && (
        <Leaderboard rows={ranked.slice(3).map((p) => ({ uid: p.uid, name: p.name, score: p.score }))} highlight={meUid} compact startRank={4} />
      )}
      {children}
    </section>
  );
}
