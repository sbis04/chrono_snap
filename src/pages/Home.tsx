import { useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate, useParams } from "react-router-dom";
import { api, db, ensureUser } from "../firebase";
import { joinRoom } from "../game";
import { useLocalStorage } from "../hooks";
import { Logo } from "../components/Logo";
import { SplitFlap } from "../components/SplitFlap";
import { sfx } from "../sound";

const ROUND_OPTIONS = [5, 8, 10];
const SECOND_OPTIONS = [30, 45, 60];
const AUTO_OPTIONS: [number, string][] = [
  [0, "Manual"],
  [10, "10s"],
  [15, "15s"],
  [25, "25s"],
];

export function Home() {
  const nav = useNavigate();
  const params = useParams();
  const [code, setCode] = useState((params.code ?? "").toUpperCase().slice(0, 4));
  const [name, setName] = useLocalStorage("cs-name", "");
  const [rounds, setRounds] = useState(5);
  const [seconds, setSeconds] = useState(45);
  const [auto, setAuto] = useState(15);
  const [busy, setBusy] = useState<"join" | "host" | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"join" | "host">("join");
  // Opened via an invite link (/ABCD): show a focused "join this room" screen.
  const linkCode = (params.code ?? "").toUpperCase();
  const [invite, setInvite] = useState(/^[A-Z]{4}$/.test(linkCode));
  const [inviteState, setInviteState] = useState<"checking" | "open" | "missing" | "finished">("checking");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ensureUser().catch(() => setError("Couldn't connect. Check your network."));
  }, []);

  useEffect(() => {
    if (!invite) return;
    let cancelled = false;
    (async () => {
      try {
        const user = await ensureUser();
        const room = await getDoc(doc(db, "rooms", linkCode));
        if (cancelled) return;
        if (!room.exists()) return setInviteState("missing");
        if (room.data().status === "finished") return setInviteState("finished");
        // Already in this room on this device (e.g. reopened the link): go straight in.
        const me = await getDoc(doc(db, "rooms", linkCode, "players", user.uid));
        if (cancelled) return;
        if (me.exists()) return nav(`/play/${linkCode}`, { replace: true });
        setInviteState("open");
        setTimeout(() => nameRef.current?.focus(), 50);
      } catch {
        if (!cancelled) setInviteState("open");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invite, linkCode, nav]);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const c = code.trim().toUpperCase();
    const n = name.trim().slice(0, 20);
    if (c.length !== 4) return setError("Room codes are 4 letters.");
    if (!n) return setError("Pick a name first.");
    setBusy("join");
    try {
      await joinRoom(c, n);
      sfx.join();
      nav(`/play/${c}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join.");
      setBusy(null);
    }
  };

  // The creator is a player too: create the room, join it, and go to the controller.
  const host = async () => {
    setError("");
    const n = name.trim().slice(0, 20);
    if (!n) return setError("Pick a name first — you're playing too.");
    setBusy("host");
    try {
      const { code } = await api.createRoom({ totalRounds: rounds, roundSeconds: seconds, autoAdvanceSeconds: auto });
      await joinRoom(code, n);
      sfx.join();
      nav(`/play/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create a room.");
      setBusy(null);
    }
  };

  if (invite) {
    const leave = () => {
      setInvite(false);
      setCode("");
      nav("/", { replace: true });
    };
    return (
      <main className="home invite">
        <div className="home-hero">
          <Logo size="md" />
        </div>
        <section className="card home-card invite-card">
          {inviteState === "missing" || inviteState === "finished" ? (
            <div className="stack">
              <span className="label">Room {linkCode}</span>
              <p className="invite-title">{inviteState === "missing" ? "This room doesn't exist (any more)." : "That game has already finished."}</p>
              <p className="hint">Rooms close after 24 hours. Ask the host for a fresh link.</p>
              <button className="btn btn-primary" onClick={leave}>
                Join or create another room
              </button>
            </div>
          ) : (
            <form onSubmit={join} className="stack">
              <span className="label">You're invited to room</span>
              <div className="invite-code">
                <SplitFlap value={linkCode} size="lg" spin={8} />
              </div>
              <label className="field">
                <span className="label">Your name</span>
                <input
                  ref={nameRef}
                  className="text-input"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 20))}
                  placeholder="What should we call you?"
                  maxLength={20}
                  autoComplete="nickname"
                  enterKeyHint="go"
                />
              </label>
              <button className="btn btn-primary btn-xl" disabled={busy !== null || inviteState === "checking"}>
                {busy === "join" ? "Joining…" : inviteState === "checking" ? "Finding the room…" : `Join ${linkCode}`}
              </button>
              {error && <p className="error" role="alert">{error}</p>}
              <button type="button" className="link-btn" onClick={leave}>
                Different room, or start your own?
              </button>
            </form>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="home">
      <div className="home-hero">
        <Logo size="lg" />
        <p className="tagline">
          One photo. One year. <em>How well do you know your decades?</em>
        </p>
      </div>

      <section className="card home-card">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "join"} className={tab === "join" ? "is-active" : ""} onClick={() => setTab("join")}>
            Join a game
          </button>
          <button role="tab" aria-selected={tab === "host"} className={tab === "host" ? "is-active" : ""} onClick={() => setTab("host")}>
            Create a room
          </button>
        </div>

        {tab === "join" ? (
          <form onSubmit={join} className="stack">
            <label className="field">
              <span className="label">Room code</span>
              <input
                className="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
                placeholder="ABCD"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                maxLength={4}
              />
            </label>
            <label className="field">
              <span className="label">Your name</span>
              <input className="text-input" value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} placeholder="Ada L." maxLength={20} autoComplete="nickname" />
            </label>
            <button className="btn btn-primary" disabled={busy !== null}>
              {busy === "join" ? "Joining…" : "Step into the darkroom"}
            </button>
          </form>
        ) : (
          <div className="stack">
            <label className="field">
              <span className="label">Your name</span>
              <input className="text-input" value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} placeholder="Ada L." maxLength={20} autoComplete="nickname" />
            </label>
            <div className="field">
              <span className="label">Rounds</span>
              <div className="segmented">
                {ROUND_OPTIONS.map((r) => (
                  <button key={r} className={rounds === r ? "is-active" : ""} onClick={() => setRounds(r)}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="label">Seconds per photo</span>
              <div className="segmented">
                {SECOND_OPTIONS.map((s) => (
                  <button key={s} className={seconds === s ? "is-active" : ""} onClick={() => setSeconds(s)}>
                    {s}s
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="label">After each reveal</span>
              <div className="segmented">
                {AUTO_OPTIONS.map(([v, label]) => (
                  <button key={v} className={auto === v ? "is-active" : ""} onClick={() => setAuto(v)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-primary" onClick={host} disabled={busy !== null}>
              {busy === "host" ? "Loading film…" : "Create room & play"}
            </button>
            <p className="hint small">You play too. Share the code, then start from your phone. Want a big screen for a meeting? Open it from the lobby.</p>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      <ol className="how">
        <li>
          <b>Study</b> cars, clothes, signs & shopfronts.
        </li>
        <li>
          <b>Dial</b> in the year on your phone.
        </li>
        <li>
          <b>Score</b> up to 5,000 for a dead-on guess.
        </li>
      </ol>
    </main>
  );
}
