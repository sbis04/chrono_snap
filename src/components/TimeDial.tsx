import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MIN_YEAR, MAX_YEAR } from "../types";
import { sfx } from "../sound";

const PX_PER_YEAR = 16;

/**
 * Radio-tuner style year picker: the tape slides under a fixed needle.
 * Drag with momentum, snaps to whole years, haptic tick on every decade.
 */
export function TimeDial({ value, onChange, disabled = false }: { value: number; onChange: (y: number) => void; disabled?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [pos, setPos] = useState(value); // fractional year under the needle
  const drag = useRef<{ x: number; start: number; lastX: number; lastT: number; v: number } | null>(null);
  const raf = useRef<number>(0);
  const lastYear = useRef(value);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Follow external changes (buttons, keyboard) when not dragging.
  useEffect(() => {
    if (!drag.current) setPos(value);
  }, [value]);

  const clamp = (y: number) => Math.min(MAX_YEAR, Math.max(MIN_YEAR, y));

  const emit = (y: number) => {
    const year = Math.round(clamp(y));
    if (year !== lastYear.current) {
      if (Math.floor(year / 10) !== Math.floor(lastYear.current / 10)) {
        navigator.vibrate?.(8);
        sfx.detent();
      }
      lastYear.current = year;
      onChange(year);
    }
  };

  const settle = (from: number, velocity: number) => {
    cancelAnimationFrame(raf.current);
    let p = from;
    let v = velocity; // years per frame
    const step = () => {
      v *= 0.86;
      p = clamp(p + v);
      if (Math.abs(v) < 0.02) {
        const target = Math.round(p);
        setPos(target);
        emit(target);
        return;
      }
      setPos(p);
      emit(p);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    cancelAnimationFrame(raf.current);
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, start: pos, lastX: e.clientX, lastT: performance.now(), v: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.v = (-(e.clientX - d.lastX) / PX_PER_YEAR / dt) * 16; // years per ~frame
    d.lastX = e.clientX;
    d.lastT = now;
    const p = clamp(d.start - (e.clientX - d.x) / PX_PER_YEAR);
    setPos(p);
    emit(p);
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const recent = performance.now() - d.lastT < 80;
    settle(pos, recent ? Math.max(-1.6, Math.min(1.6, d.v)) : 0);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1, PageDown: -10, PageUp: 10 }[e.key];
    if (delta) {
      e.preventDefault();
      const y = clamp(value + delta);
      setPos(y);
      emit(y);
    }
  };

  const tapeWidth = (MAX_YEAR - MIN_YEAR) * PX_PER_YEAR;
  const offset = width / 2 - (pos - MIN_YEAR) * PX_PER_YEAR;
  const ticks = [];
  for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
    const x = (y - MIN_YEAR) * PX_PER_YEAR;
    const major = y % 10 === 0;
    const mid = y % 5 === 0;
    ticks.push(<line key={y} x1={x} x2={x} y1={major ? 6 : mid ? 16 : 22} y2={46} className={major ? "tick-major" : mid ? "tick-mid" : "tick"} />);
    if (major) {
      ticks.push(
        <text key={`t${y}`} x={x} y={66} className="tick-label">
          {y}
        </text>,
      );
    }
  }

  return (
    <div
      ref={wrapRef}
      className={`timedial ${disabled ? "is-disabled" : ""}`}
      role="slider"
      tabIndex={0}
      aria-valuemin={MIN_YEAR}
      aria-valuemax={MAX_YEAR}
      aria-valuenow={value}
      aria-label="Year"
      onKeyDown={onKey}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg className="timedial-tape" width={tapeWidth + 40} height="76" style={{ transform: `translateX(${offset - 20}px)` }} viewBox={`-20 0 ${tapeWidth + 40} 76`}>
        {ticks}
      </svg>
      <div className="timedial-needle" />
      <div className="timedial-glass" />
    </div>
  );
}
