import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { api, db } from "../firebase";
import { rememberPhotos, startOrAdvance, useServerTimerNudges } from "../game";
import { NextCountdown } from "../components/NextCountdown";
import { QR } from "../components/QR";
import { HostPanel } from "../components/HostPanel";
import { HowToPlay } from "../components/HowToPlay";
import { CopyLink } from "../components/CopyLink";
import { FinalStandings } from "../components/FinalStandings";
import { useCountdown, usePlayers, useResult, useRoom, useUser } from "../hooks";
import type { Player, Room, RoundResult } from "../types";
import { MIN_YEAR, MAX_YEAR } from "../types";
import { DevelopingPhoto } from "../components/DevelopingPhoto";
import { TimeDial } from "../components/TimeDial";
import { SplitFlap } from "../components/SplitFlap";
import { Logo } from "../components/Logo";
import { Leaderboard } from "../components/Leaderboard";
import { Countdown } from "../components/Countdown";
import { Timeline } from "../components/Timeline";
import { sfx } from "../sound";

/** undefined = loading, null = not in the room */
function useMe(code: string, uid: string | undefined): Player | null | undefined {
  const [me, setMe] = useState<Player | null | undefined>(undefined);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, "rooms", code, "players", uid),
      (s) => setMe(s.exists() ? ({ uid, ...s.data() } as Player) : null),
      () => setMe(null),
    );
  }, [code, uid]);
  return me;
}

export function Play() {
  const { code = "" } = useParams();
  const user = useUser();
  const room = useRoom(code, !!user);
  const me = useMe(code, user?.uid);
  const players = usePlayers(code, !!user);
  useServerTimerNudges(room);
  const [panel, setPanel] = useState(false);

  if (!user || room === undefined || me === undefined) return <div className="center-screen"><div className="loader">Developing…</div></div>;
  if (room === null || me === null)
    return (
      <div className="center-screen stack play-pad">
        <h1 className="headline">{room === null ? `Room ${code} is gone` : "You're not in this room"}</h1>
        <Link className="btn btn-primary" to={room === null ? "/" : `/${code}`}>
          {room === null ? "Back to start" : `Join ${code}`}
        </Link>
      </div>
    );

  return (
    <main className={`play play-${room.status}`}>
      <header className="play-bar">
        <span className="wide-only play-logo">
          <Logo size="sm" />
        </span>
        <span className="code-chip">
          <b>{code}</b>
        </span>
        <span className="play-name">{me.name}</span>
        <span className="play-score">{me.score.toLocaleString()} pts</span>
        {room.hostUid === me.uid && (
          <button className="host-chip" onClick={() => setPanel(true)} aria-haspopup="dialog">
            Host
          </button>
        )}
      </header>
      {panel && room.hostUid === me.uid && <HostPanel room={room} players={players} meUid={me.uid} onClose={() => setPanel(false)} />}
      {room.status === "lobby" && (room.hostUid === me.uid ? <HostLobby room={room} players={players} /> : <PlayLobby me={me} players={players} hostUid={room.hostUid} />)}
      {room.status === "guessing" && <PlayGuess key={room.currentRound} room={room} me={me} players={players} />}
      {room.status === "reveal" && <PlayReveal room={room} me={me} players={players} />}
      {room.status === "finished" && <PlayFinished room={room} me={me} players={players} />}
    </main>
  );
}

function PlayLobby({ me, players, hostUid }: { me: Player; players: Player[]; hostUid: string }) {
  const hostName = players.find((p) => p.uid === hostUid)?.name ?? "The host";
  return (
    <section className="lobby-split player-lobby">
      <div className="lobby-main">
      <div className="polaroid polaroid-sm">
        <div className="polaroid-img">
          <span>{me.name.slice(0, 1).toUpperCase()}</span>
        </div>
        <span className="polaroid-caption">{me.name}</span>
      </div>
      <p className="hint">
        You're in! <b>{hostName}</b> will start the game.
      </p>
      <Roster players={players} meUid={me.uid} hostUid={hostUid} />
      </div>
      <div className="lobby-aside">
        <HowToPlay />
      </div>
    </section>
  );
}

/** Everyone in the room, as little paper tags that drop in as people join. */
function Roster({ players, meUid, hostUid }: { players: Player[]; meUid: string; hostUid: string }) {
  const sorted = [...players].sort((a, b) => (a.uid === hostUid ? -1 : b.uid === hostUid ? 1 : 0));
  return (
    <div className="roster">
      <span className="label">
        In the darkroom · {players.length} {players.length === 1 ? "player" : "players"}
      </span>
      <ul className="roster-tags">
        {sorted.map((p, i) => (
          <li
            key={p.uid}
            className={`${p.uid === meUid ? "is-me" : ""} ${p.uid === hostUid ? "is-host" : ""}`}
            style={{ ["--tilt" as string]: `${((i * 37) % 5) - 2}deg` }}
          >
            {p.name}
            {p.uid === hostUid && <small>host</small>}
            {p.uid === meUid && p.uid !== hostUid && <small>you</small>}
          </li>
        ))}
        <li className="roster-waiting" aria-hidden>
          waiting for more…
        </li>
      </ul>
    </div>
  );
}

/** The room creator's lobby: share the room, then start when everyone's in. */
function HostLobby({ room, players }: { room: Room; players: Player[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const link = `${window.location.origin}/${room.code}`;
  const canShare = typeof navigator.share === "function";
  const share = () => navigator.share({ title: "Join my ChronoSnap game", text: `Join room ${room.code}`, url: link }).catch(() => undefined);
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      sfx.shutter();
      await startOrAdvance(room.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start.");
      setBusy(false);
    }
  };
  return (
    <section className="lobby-split host-lobby">
      <div className="lobby-main">
      <span className="label">Your room</span>
      <SplitFlap value={room.code} size="lg" />
      <CopyLink code={room.code} />
      <div className="share-row">
        <QR text={link} size={96} />
        <div className="stack share-actions">
          {canShare && (
            <button className="btn btn-ghost" onClick={share}>
              Share via…
            </button>
          )}
          <a className="btn btn-ghost" href={`/host/${room.code}`} target="_blank" rel="noreferrer">
            Big-screen view ↗
          </a>
        </div>
      </div>
      <Roster players={players} meUid={room.hostUid} hostUid={room.hostUid} />
      <p className="hint">
        {room.settings.totalRounds} photos · {room.settings.roundSeconds}s each
      </p>
      <button className="btn btn-primary btn-xl btn-shutter" onClick={start} disabled={busy}>
        {busy ? "Loading film…" : players.length < 2 ? "Start solo" : `Start with ${players.length}`}
      </button>
      {error && <p className="error">{error}</p>}
      </div>
      <div className="lobby-aside">
        <HowToPlay />
      </div>
    </section>
  );
}

function PlayGuess({ room, me, players }: { room: Room; me: Player; players: Player[] }) {
  const [year, setYear] = useState(1955);
  const [lockedYear, setLockedYear] = useState<number | null>(null);
  const [editing, setEditing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(false);
  const left = useCountdown(room.roundEndsAt?.toMillis() ?? null);
  const total = room.settings.roundSeconds * 1000;
  // The server (rules + reveal) owns the deadline; the local clock only drives
  // the progress bar, so a skewed device clock can never lock a player out.

  // Restore a guess made before a refresh. Guess ids are "{round}_{uid}", so a
  // previous game in the same room used the same ids: only trust a guess written
  // during *this* round (or our own pending write), and reset when there is none.
  // Otherwise a stale cached copy shows "your guess is in" for a round never played.
  const roundStartMs = (room.roundEndsAt?.toMillis() ?? 0) - total;
  useEffect(() => {
    return onSnapshot(
      doc(db, "rooms", room.code, "guesses", `${room.currentRound}_${me.uid}`),
      (s) => {
        const g = s.data() as { year: number; at?: { toMillis(): number } | null } | undefined;
        const fresh = g && (s.metadata.hasPendingWrites || (g.at != null && g.at.toMillis() >= roundStartMs - 2000));
        if (g && fresh) {
          setLockedYear(g.year);
          setYear(g.year);
          setEditing(false);
        } else if (!s.metadata.fromCache) {
          setLockedYear(null);
          setEditing(true);
        }
      },
      () => undefined,
    );
  }, [room.code, room.currentRound, me.uid, roundStartMs]);

  const lock = async () => {
    setSaving(true);
    setError("");
    try {
      await setDoc(doc(db, "rooms", room.code, "guesses", `${room.currentRound}_${me.uid}`), {
        uid: me.uid,
        round: room.currentRound,
        year,
        at: serverTimestamp(),
      });
      sfx.shutter();
      navigator.vibrate?.([20, 40, 20]);
      setLockedYear(year);
      setEditing(false);
    } catch {
      setError(left <= 0 ? "Too late — the shutter closed." : "Couldn't save your guess. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const bump = (d: number) => setYear((y) => Math.min(MAX_YEAR, Math.max(MIN_YEAR, y + d)));
  const frac = total > 0 ? left / total : 0;

  return (
    <section className="play-guess">
      <div className="timebar">
        <div className={`timebar-fill ${left < 5000 ? "is-urgent" : ""}`} style={{ transform: `scaleX(${frac})` }} />
      </div>
      <div className="play-photo">
        {room.photo && <DevelopingPhoto src={room.photo.src} onClick={() => setZoom(true)} />}
        <span className="zoom-hint">⤢ Zoom</span>
      </div>

      <div className="guess-side">
      <div className="wide-only guess-timer">
        <Countdown msLeft={left} totalMs={total} size={112} />
        <p className="prompt">What year is it?</p>
      </div>
      {editing || lockedYear === null ? (
        <div className="guess-panel">
          <div className="year-readout">
            <button className="nudge" onClick={() => bump(-1)} aria-label="One year earlier">
              −
            </button>
            <span className="year-big" key={Math.floor(year / 10)}>
              {year}
            </span>
            <button className="nudge" onClick={() => bump(1)} aria-label="One year later">
              +
            </button>
          </div>
          <TimeDial value={year} onChange={setYear} />
          <button className="btn btn-primary btn-xl btn-shutter" onClick={lock} disabled={saving}>
            {saving ? "Exposing…" : left <= 0 ? `Quick! Lock ${year}` : lockedYear !== null ? `Re-lock ${year}` : `Lock in ${year}`}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <div className="guess-panel guess-locked">
          <span className="label">Your guess is in</span>
          <span className="year-big locked-stamp">{lockedYear}</span>
          <button className="btn btn-ghost" onClick={() => setEditing(true)}>
            Change my mind
          </button>
          <p className="hint">Waiting for the reveal…</p>
        </div>
      )}
      <div className="wide-only locked">
        <span className="label">
          Locked in · {players.filter((p) => p.lockedRound === room.currentRound).length}/{players.length}
        </span>
        <ul className={players.length > 6 ? "is-grid" : ""}>
          {players.map((p) => (
            <li key={p.uid} className={p.lockedRound === room.currentRound ? "is-locked" : ""}>
              <span className="dot" />
              {p.name}
              {p.uid === me.uid && <small> (you)</small>}
            </li>
          ))}
        </ul>
      </div>
      </div>

      {zoom && room.photo && (
        <div className="zoom-layer" onClick={() => setZoom(false)}>
          <div className="zoom-scroll" onClick={(e) => e.stopPropagation()}>
            <img
              src={room.photo.src}
              alt=""
              onLoad={(e) => {
                const box = e.currentTarget.parentElement!;
                box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
              }}
            />
          </div>
          <span className="zoom-pan-hint">Drag to pan · pinch to zoom</span>
          <button className="icon-btn zoom-close" aria-label="Close" onClick={() => setZoom(false)}>
            ×
          </button>
        </div>
      )}
    </section>
  );
}

function useCountUp(target: number, ms = 1200) {
  const [n, setN] = useState(0);
  const start = useRef<number | null>(null);
  useEffect(() => {
    start.current = null;
    let raf = 0;
    const step = (t: number) => {
      start.current ??= t;
      const k = Math.min(1, (t - start.current) / ms);
      setN(Math.round(target * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

function verdict(delta: number | null) {
  if (delta === null) return "No guess this round";
  if (delta === 0) return "Dead on. Are you a time traveller?";
  if (delta <= 2) return "Practically there!";
  if (delta <= 5) return "Close. Nice eye.";
  if (delta <= 12) return "Right era, wrong year";
  if (delta <= 25) return "A generation off";
  return "Lost in time…";
}

function PlayReveal({ room, me, players }: { room: Room; me: Player; players: Player[] }) {
  const result = useResult(room.code, room.currentRound, true);
  const mine = result?.players[me.uid];
  const points = useCountUp(mine?.points ?? 0);
  useEffect(() => {
    if (result) {
      rememberPhotos([room.photoIds[room.currentRound]]);
      sfx.flaps(10);
      if (mine && mine.points > 3000) navigator.vibrate?.([30, 50, 30, 50, 60]);
    }
  }, [result, mine, room.photoIds, room.currentRound]);
  if (!result) return <div className="center-screen"><div className="loader">Fixing the print…</div></div>;
  const delta = mine?.year != null ? Math.abs(mine.year - result.photo.year) : null;
  const rank = [...players].sort((a, b) => b.score - a.score).findIndex((p) => p.uid === me.uid) + 1;
  return (
    <section className="play-reveal reveal-split">
      <div className="reveal-photo-col">
      <figure className="mini-print">
        <DevelopingPhoto src={result.photo.src} alt={result.photo.title} />
        <figcaption>
          {result.photo.title}
          <span className="wide-only mini-print-meta">
            {result.photo.location} · {result.photo.credit} · {result.photo.license} ·{" "}
            <a href={result.photo.sourceUrl} target="_blank" rel="noreferrer">
              {result.photo.source}
            </a>
          </span>
        </figcaption>
      </figure>
      </div>
      <div className="reveal-info-col">
      <span className="label">The year was</span>
      <SplitFlap value={String(result.photo.year)} size="lg" />
      <p className="verdict">{verdict(delta)}</p>
      <div className="reveal-stats">
        <div>
          <span className="label">You said</span>
          <b>{mine?.year ?? "—"}</b>
        </div>
        <div>
          <span className="label">Off by</span>
          <b>{delta === null ? "—" : `${delta} yr${delta === 1 ? "" : "s"}`}</b>
        </div>
        <div>
          <span className="label">Points</span>
          <b className="points">+{points.toLocaleString()}</b>
        </div>
      </div>
      <p className="hint">
        You're <b>#{rank}</b> of {players.length} · {me.score.toLocaleString()} total
      </p>
      <div className="wide-only reveal-wide-extras">
        <Timeline result={result} />
        <Leaderboard rows={revealRows(players, result, me.uid)} highlight={me.uid} compact />
      </div>
      <NextCountdown room={room} />
      {room.hostUid === me.uid && (
        <button className="btn btn-ghost" onClick={() => startOrAdvance(room.code).catch(() => undefined)}>
          {room.nextAt ? "Skip ahead" : room.currentRound + 1 >= room.settings.totalRounds ? "Final standings" : "Next photo"}
        </button>
      )}
      </div>
    </section>
  );
}

/** Top five after this round, plus the viewer if they're further down. */
function revealRows(players: Player[], result: RoundResult, meUid: string) {
  const rows = players
    .map((p) => {
      const r = result.players[p.uid];
      return { uid: p.uid, name: p.name, score: r?.total ?? p.score, delta: r?.points ?? 0, sub: r ? (r.year === null ? "no guess" : `guessed ${r.year}`) : undefined };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const top = rows.slice(0, 5);
  const mine = rows.find((r) => r.uid === meUid);
  return mine && !top.includes(mine) ? [...top.slice(0, 4), mine] : top;
}

function PlayFinished({ room, me, players }: { room: Room; me: Player; players: Player[] }) {
  const [busy, setBusy] = useState(false);
  return (
    <FinalStandings room={room} players={players} meUid={me.uid}>
      {room.hostUid === me.uid ? (
        <div className="row">
          <button
            className="btn btn-primary btn-xl"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              api.resetRoom({ code: room.code }).catch(() => setBusy(false));
            }}
          >
            Play again with this crew
          </button>
          <Link className="btn btn-ghost" to="/">
            New room
          </Link>
        </div>
      ) : (
        <p className="hint">Stick around — the host can start another game.</p>
      )}
    </FinalStandings>
  );
}
