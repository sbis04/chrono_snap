import { useEffect, useRef, useState } from "react";

const DIGITS = "0123456789";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function Flap({ char, delay, spins }: { char: string; delay: number; spins: number }) {
  const [shown, setShown] = useState(char);
  const first = useRef(true);

  useEffect(() => {
    if (first.current && spins === 0) {
      first.current = false;
      setShown(char);
      return;
    }
    first.current = false;
    const pool = /\d/.test(char) ? DIGITS : LETTERS;
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;
    const run = () => {
      step++;
      if (step >= spins) {
        setShown(char);
        return;
      }
      setShown(pool[Math.floor(Math.random() * pool.length)]);
      timer = setTimeout(run, 55);
    };
    timer = setTimeout(run, delay);
    return () => clearTimeout(timer);
  }, [char, delay, spins]);

  return (
    <span className="flap">
      <span key={shown} className="flap-char">
        {shown}
      </span>
    </span>
  );
}

/** Departure-board style tiles. `spin` re-runs the clatter whenever the value changes. */
export function SplitFlap({ value, spin = 10, stagger = 140, size = "md" }: { value: string; spin?: number; stagger?: number; size?: "sm" | "md" | "lg" | "xl" }) {
  return (
    <span className={`splitflap splitflap-${size}`} aria-label={value}>
      {value.split("").map((c, i) => (
        <Flap key={i} char={c} delay={i * stagger} spins={spin + i * 4} />
      ))}
    </span>
  );
}
