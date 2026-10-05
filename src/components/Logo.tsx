export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <div className={`logo logo-${size}`} aria-label="ChronoSnap">
      <span className="logo-aperture" aria-hidden>
        <svg viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="17" />
          {Array.from({ length: 6 }, (_, i) => (
            <path key={i} d="M20 3 L27 15" transform={`rotate(${i * 60} 20 20)`} />
          ))}
        </svg>
      </span>
      <span className="logo-chrono">Chrono</span>
      <span className="logo-snap">Snap</span>
    </div>
  );
}
