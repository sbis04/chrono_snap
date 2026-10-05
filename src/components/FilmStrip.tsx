/** Round progress as a strip of film frames with sprocket holes. */
export function FilmStrip({ total, current, status }: { total: number; current: number; status: string }) {
  return (
    <div className="filmstrip" aria-label={`Round ${current + 1} of ${total}`}>
      <div className="sprockets" />
      <div className="frames">
        {Array.from({ length: total }, (_, i) => {
          const state = i < current || (i === current && status !== "guessing") ? "exposed" : i === current ? "active" : "blank";
          return (
            <div key={i} className={`frame frame-${state}`}>
              <span>{String(i + 1).padStart(2, "0")}</span>
            </div>
          );
        })}
      </div>
      <div className="sprockets" />
    </div>
  );
}
