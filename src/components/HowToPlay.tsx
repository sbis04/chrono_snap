import { useEffect, useState } from "react";

const STEPS = [
  { icon: "◎", title: "Study", body: "A real street photo appears. Look at cars, clothes, shop signs, phones, posters." },
  { icon: "⟷", title: "Dial", body: "Drag the year tuner (or use ← →). Fine-tune with − / +. Open the photo to zoom in." },
  { icon: "◉", title: "Lock in", body: "Hit Lock before the shutter closes. You can change your mind until time's up." },
  { icon: "★", title: "Score", body: "The closer you are, the more you get. Nail the exact year for 5,000." },
];

const POINTS: [string, string][] = [
  ["Exact", "5,000"],
  ["1 yr", "4,303"],
  ["5 yrs", "2,361"],
  ["10 yrs", "1,115"],
  ["25 yrs", "117"],
];

const TIPS = [
  "Car shapes date fast: rounded fenders scream 1940s, boxy sedans the '70s–'80s.",
  "Colour film became common in the late '60s. Grainy black & white usually means earlier.",
  "Read the signs: typefaces, phone numbers and logos change every decade.",
  "Clothes and hair are clocks: hats everywhere before the '60s, flares in the '70s.",
  "Spot the tech: horse carts, trams, phone booths, satellite dishes, smartphones.",
  "Photos come from all over the world — the same year can look very different in Kolkata, London and Tokyo.",
  "Being 3 years off still earns over 3,000 points. Commit to a decade, then fine-tune.",
];

/** Rules + rotating era-spotting tips, shown while everyone waits in the lobby. */
export function HowToPlay({ variant = "compact" }: { variant?: "compact" | "screen" }) {
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 6500);
    return () => clearInterval(id);
  }, []);

  return (
    <section className={`howto howto-${variant}`} aria-label="How to play">
      <span className="label howto-title">How to play</span>
      <ol className="howto-steps">
        {STEPS.map((s, i) => (
          <li key={s.title} style={{ animationDelay: `${120 + i * 110}ms` }}>
            <span className="howto-frame">{String(i + 1).padStart(2, "0")}</span>
            <span className="howto-icon" aria-hidden>
              {s.icon}
            </span>
            <b>{s.title}</b>
            <span className="howto-body">{s.body}</span>
          </li>
        ))}
      </ol>
      <div className="howto-points" aria-label="Points by how far off you are">
        {POINTS.map(([off, pts]) => (
          <span key={off}>
            <small>{off}</small>
            <b>{pts}</b>
          </span>
        ))}
      </div>
      <p className="howto-tip" key={tip}>
        <span className="howto-tip-tag">Spot the era</span>
        {TIPS[tip]}
      </p>
    </section>
  );
}
