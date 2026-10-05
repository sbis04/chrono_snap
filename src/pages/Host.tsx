import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../firebase";
import { useCountdown, usePlayers, useResult, useRoom, useUser } from "../hooks";
import type { Player, Room, RoundResult } from "../types";
import { SplitFlap } from "../components/SplitFlap";
import { QR } from "../components/QR";
import { Logo } from "../components/Logo";
import { FilmStrip } from "../components/FilmStrip";
import { Countdown } from "../components/Countdown";
import { DevelopingPhoto } from "../components/DevelopingPhoto";
import { Timeline } from "../components/Timeline";
import { Leaderboard } from "../components/Leaderboard";
import { NextCountdown } from "../components/NextCountdown";
import { HowToPlay } from "../components/HowToPlay";
import { CopyLink } from "../components/CopyLink";
import { isMuted, setMuted, sfx } from "../sound";
import { recentIds, rememberPhotos, useServerTimerNudges } from "../game";

// Keep the reveal on one screen for big groups; everyone sees their own rank on their phone.
const REVEAL_ROWS = 5;

export function Host() {
  const { code = "" } = useParams();
  const user = useUser();
  const room = useRoom(code, !!user);
  const players = usePlayers(code, !!user);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [muted, setMutedState] = useState(isMuted());
  useServerTimerNudges(room);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const advance = () => {
    sfx.shutter();
    return run(() => api.advance({ code, recentIds: recentIds() }));
  };

  if (!user || room === undefined) return <div className="center-screen"><div className="loader">Loading the projector…</div></div>;
  if (room === null)
    return (
      <div className="center-screen stack">
        <h1 className="headline">Room {code} doesn't exist</h1>
        <p className="hint">Rooms are cleared after 24 hours.</p>
        <Link className="btn btn-primary" to="/">Open a new room</Link>
      </div>
    );
  // Anyone can open the big screen to share it; only the room creator gets controls.
  const isHost = room.hostUid === user.uid;

  return (
    <main className={`host host-${room.status}`}>
      <header className="host-bar">
        <Logo size="sm" />
        {room.status !== "lobby" && room.status !== "finished" && (
          <FilmStrip total={room.settings.totalRounds} current={room.currentRound} status={room.status} />
        )}
        <div className="host-bar-right">
          {room.status !== "lobby" && (
            <CopyLink code={code} size="sm" />
          )}
          <button
            className="icon-btn"
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      </header>

      {room.status === "lobby" && <Lobby room={room} players={players} busy={busy} isHost={isHost} onStart={advance} />}
      {room.status === "guessing" && (
        <Guessing room={room} players={players} busy={busy} isHost={isHost} onRevealNow={() => run(() => api.revealRound({ code, round: room.currentRound, force: true }))} />
      )}
      {room.status === "reveal" && <Reveal room={room} players={players} busy={busy} isHost={isHost} onNext={advance} />}
      {room.status === "finished" && <Finished room={room} players={players} busy={busy} isHost={isHost} onAgain={() => run(() => api.resetRoom({ code }))} />}

      {error && <p className="error host-error" role="alert">{error}</p>}
    </main>
  );
}

function Lobby({ room, players, busy, isHost, onStart }: { room: Room; players: Player[]; busy: boolean; isHost: boolean; onStart: () => void }) {
  const joinUrl = `${window.location.origin}/${room.code}`;
  const prevCount = useRef(players.length);
  useEffect(() => {
    if (players.length > prevCount.current) sfx.join();
    prevCount.current = players.length;
  }, [players.length]);

  return (
    <section className="lobby">
      <div className="lobby-join">
        <p className="kicker">Grab your phone · go to</p>
        <p className="join-url">{window.location.host}</p>
        <p className="kicker">and enter the code</p>
        <SplitFlap value={room.code} size="xl" spin={14} />
        <div className="lobby-qr">
          <QR text={joinUrl} size={150} />
          <div className="lobby-share">
            <span className="hint">or scan, or share this link:</span>
            <CopyLink code={room.code} size="lg" />
          </div>
        </div>
        <HowToPlay variant="screen" />
      </div>

      <div className="lobby-roster">
        <div className="roster-head">
          <h2 className="section-title">Contact sheet</h2>
          <span className="label">{players.length} {players.length === 1 ? "player" : "players"}</span>
        </div>
        {players.length === 0 ? (
          <div className="roster-empty">
            <div className="empty-frame" />
            <p>Waiting for the first face to develop…</p>
          </div>
        ) : (
          <ul className="contact-sheet">
            {players.map((p, i) => (
              <li key={p.uid} className="contact" style={{ ["--tilt" as string]: `${((i * 37) % 7) - 3}deg` }}>
                <span className="contact-frame">{String(i + 1).padStart(2, "0")}A</span>
                <span className="contact-name">{p.name}</span>
                {isHost && p.uid !== room.hostUid && (
                  <button className="contact-kick" aria-label={`Remove ${p.name}`} onClick={() => api.kickPlayer({ code: room.code, playerUid: p.uid })}>
                    ×
                  </button>
                )}
              </li>
            ))}
            <li className="contact contact-next" style={{ ["--tilt" as string]: "0deg" }}>
              <span className="contact-frame">{String(players.length + 1).padStart(2, "0")}A</span>
              <span className="contact-name">Next frame…</span>
            </li>
          </ul>
        )}
        <div className="lobby-actions">
          <span className="label">
            {room.settings.totalRounds} photos · {room.settings.roundSeconds}s each
          </span>
          {isHost ? (
            <button className="btn btn-primary btn-xl" onClick={onStart} disabled={busy || players.length === 0}>
              {players.length === 0 ? "Waiting for players" : busy ? "Loading film…" : "Start the clock"}
            </button>
          ) : (
            <span className="waiting-host">
              Waiting for <b>{players.find((p) => p.uid === room.hostUid)?.name ?? "the host"}</b> to start…
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function Guessing({ room, players, busy, isHost, onRevealNow }: { room: Room; players: Player[]; busy: boolean; isHost: boolean; onRevealNow: () => void }) {
  const endsAt = room.roundEndsAt?.toMillis() ?? null;
  const left = useCountdown(endsAt);
  const total = room.settings.roundSeconds * 1000;
  const locked = players.filter((p) => p.lockedRound === room.currentRound);


  return (
    <section className="guessing">
      <div className="guessing-stage">
        {room.photo && <DevelopingPhoto src={room.photo.src} className="stage-photo" />}
      </div>
      <aside className="guessing-side">
        <Countdown msLeft={left} totalMs={total} size={150} sound />
        <p className="prompt">
          What year
          <br />
          is it?
        </p>
        <div className="locked">
          <span className="label">
            Locked in · {locked.length}/{players.length}
          </span>
          <ul className={players.length > 6 ? "is-grid" : ""}>
            {players.map((p) => {
              const isLocked = p.lockedRound === room.currentRound;
              return (
                <li key={p.uid} className={isLocked ? "is-locked" : ""}>
                  <span className="dot" />
                  {p.name}
                </li>
              );
            })}
          </ul>
        </div>
        {isHost && (
          <button className="btn btn-ghost" onClick={onRevealNow} disabled={busy}>
            Reveal now
          </button>
        )}
      </aside>
    </section>
  );
}

function Reveal({ room, players, busy, isHost, onNext }: { room: Room; players: Player[]; busy: boolean; isHost: boolean; onNext: () => void }) {
  const result = useResult(room.code, room.currentRound, true);
  const [flash, setFlash] = useState(false);
  const isLast = room.currentRound + 1 >= room.settings.totalRounds;

  useEffect(() => {
    if (!result) return;
    rememberPhotos([room.photoIds[room.currentRound]]);
    setFlash(true);
    sfx.shutter();
    const t1 = setTimeout(() => sfx.flaps(18), 250);
    const t2 = setTimeout(() => setFlash(false), 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [result, room.photoIds, room.currentRound]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && isHost && !busy && result) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, isHost, result, onNext]);

  const rows = useMemo(() => buildRows(players, result), [players, result]);

  if (!result) return <div className="center-screen"><div className="loader">Fixing the print…</div></div>;
  const p = result.photo;

  return (
    <section className="reveal">
      {flash && <div className="flash" aria-hidden />}
      <div className="reveal-photo">
        <figure className="print">
          <DevelopingPhoto src={p.src} alt={p.title} />
          <figcaption className="catalog-card">
            <span className="label">Catalog no. {room.photoIds[room.currentRound]}</span>
            <strong>{p.title}</strong>
            <span>{p.location}</span>
            <small>
              {p.credit} · {p.license} ·{" "}
              <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                {p.source}
              </a>
            </small>
          </figcaption>
        </figure>
      </div>
      <div className="reveal-info">
        <p className="kicker">This photo was taken in</p>
        <div className="reveal-head">
          <SplitFlap value={String(p.year)} size="xl" spin={16} stagger={180} />
          <div className="stack reveal-next">
            {isHost && (
              <button className="btn btn-primary btn-xl" onClick={onNext} disabled={busy}>
                {room.nextAt ? "Skip ahead" : isLast ? "Final standings" : "Next photo"} <kbd>↵</kbd>
              </button>
            )}
            <NextCountdown room={room} />
          </div>
        </div>
        {p.clues.length > 0 && (
          <ul className="clues">
            {p.clues.map((c, i) => (
              <li key={i} style={{ animationDelay: `${1400 + i * 250}ms` }}>
                {c}
              </li>
            ))}
          </ul>
        )}
        <Timeline result={result} />
        <Leaderboard rows={rows.slice(0, REVEAL_ROWS)} compact />
        {rows.length > REVEAL_ROWS && <p className="hint lb-more">…and {rows.length - REVEAL_ROWS} more on their phones</p>}
      </div>
    </section>
  );
}

function buildRows(players: Player[], result: RoundResult | null) {
  return players
    .map((pl) => {
      const r = result?.players[pl.uid];
      return {
        uid: pl.uid,
        name: pl.name,
        score: r?.total ?? pl.score,
        delta: r?.points ?? 0,
        sub: r ? (r.year === null ? "no guess" : `guessed ${r.year}`) : undefined,
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function Finished({ room, players, busy, isHost, onAgain }: { room: Room; players: Player[]; busy: boolean; isHost: boolean; onAgain: () => void }) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  useEffect(() => {
    sfx.fanfare();
  }, []);
  const podium = [ranked[1], ranked[0], ranked[2]];
  return (
    <section className="finished">
      <p className="kicker">Final standings · {room.settings.totalRounds} photos</p>
      <h1 className="headline">The archive has spoken</h1>
      <div className="podium">
        {podium.map((p, i) =>
          p ? (
            <div key={p.uid} className={`podium-step step-${[2, 1, 3][i]}`} style={{ animationDelay: `${[400, 900, 0][i]}ms` }}>
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
      {ranked.length > 3 && <Leaderboard rows={ranked.slice(3).map((p) => ({ uid: p.uid, name: p.name, score: p.score }))} compact startRank={4} />}
      {isHost && (
        <div className="row">
          <button className="btn btn-primary btn-xl" onClick={onAgain} disabled={busy}>
            Play again with this crew
          </button>
          <Link className="btn btn-ghost" to="/">
            New room
          </Link>
        </div>
      )}
    </section>
  );
}
