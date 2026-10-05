import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QR({ text, size = 200 }: { text: string; size?: number }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    QRCode.toDataURL(text, { margin: 1, width: size * 2, color: { dark: "#1a1210", light: "#f1e6d0" } }).then(setUrl);
  }, [text, size]);
  return url ? <img className="qr" src={url} width={size} height={size} alt={`QR code for ${text}`} /> : <div className="qr" style={{ width: size, height: size }} />;
}
