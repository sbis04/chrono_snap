import { useState } from "react";

/** A photo that "develops" like a print in a chemical tray once it has loaded. */
export function DevelopingPhoto({ src, alt = "", className = "", onClick }: { src: string; alt?: string; className?: string; onClick?: () => void }) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const loaded = loadedSrc === src;
  return (
    <div className={`photo-frame ${loaded ? "is-loaded" : ""} ${className}`} onClick={onClick}>
      <img key={src} src={src} alt={alt} draggable={false} onLoad={() => setLoadedSrc(src)} className="developing" />
      {!loaded && <div className="photo-tray">Developing…</div>}
    </div>
  );
}
