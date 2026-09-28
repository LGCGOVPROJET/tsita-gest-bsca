import { useMemo } from 'react';
import QRCode from 'qrcode';

/**
 * QR code généré localement (aucun service externe) et rendu en SVG React :
 * pas d'injection HTML, compatible avec la CSP stricte du build.
 */
export function QrCode({ value, size = 200, label }: { value: string; size?: number; label: string }) {
  const matrix = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    return { n: qr.modules.size, data: qr.modules.data };
  }, [value]);
  const margin = 4;
  const dim = matrix.n + margin * 2;
  const path = useMemo(() => {
    let d = '';
    for (let y = 0; y < matrix.n; y++) {
      for (let x = 0; x < matrix.n; x++) {
        if (matrix.data[y * matrix.n + x]) d += `M${x + margin} ${y + margin}h1v1h-1z`;
      }
    }
    return d;
  }, [matrix]);
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${dim} ${dim}`}
      shapeRendering="crispEdges"
      style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--line)' }}
    >
      <path d={path} fill="#102f50" />
    </svg>
  );
}
