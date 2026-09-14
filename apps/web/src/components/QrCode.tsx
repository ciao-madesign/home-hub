import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** QR code per il discovery locale (§21): un secondo dispositivo lo scansiona per aprire l'URL dell'Hub. */
export function QrCode({ value, size = 180 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "var(--radius-sm)",
          background: "var(--bg-hover)",
        }}
      />
    );
  }

  return (
    <img
      src={dataUrl}
      alt={`QR code per ${value}`}
      width={size}
      height={size}
      style={{ borderRadius: "var(--radius-sm)", background: "white", padding: 8 }}
    />
  );
}
