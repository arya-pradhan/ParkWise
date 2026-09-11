import { ImageResponse } from 'next/og';

export const alt = 'ParkWise — find open parking spaces, entirely in your browser';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Rendered once at build time by next/og. No external assets, so it is not
 * affected by the COEP header and needs no design tooling to regenerate.
 */
export default function OpenGraphImage() {
  // A stylised lot: two rows of spaces, a mix of open and occupied.
  const rows = [
    ['occ', 'occ', 'open', 'occ', 'open', 'occ', 'occ', 'open'],
    ['open', 'occ', 'occ', 'open', 'occ', 'open', 'occ', 'occ'],
  ];
  const OPEN = '#30a46c';
  const OCC = '#e5484d';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: 'linear-gradient(135deg, #17181c 0%, #22242b 100%)',
          color: '#f4f4f6',
          fontFamily: 'Inter, system-ui, sans-serif',
          padding: 64,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 560 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
            <div
              style={{
                width: 48, height: 48, borderRadius: 12, display: 'flex',
                background: `linear-gradient(90deg, ${OPEN} 50%, ${OCC} 50%)`,
                alignItems: 'center', justifyContent: 'center',
                color: 'white', fontSize: 30, fontWeight: 700,
              }}
            >
              P
            </div>
            <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.5 }}>ParkWise</div>
          </div>
          <div style={{ fontSize: 60, fontWeight: 600, lineHeight: 1.05, letterSpacing: -2 }}>
            Find the open spaces in a parking lot.
          </div>
          <div style={{ fontSize: 24, color: '#a3a6ad', marginTop: 22, lineHeight: 1.35 }}>
            A YOLOv5 detector running entirely in your browser. Nothing is uploaded.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rows.map((row, r) => (
            <div key={r} style={{ display: 'flex', gap: 14 }}>
              {row.map((c, i) => (
                <div
                  key={i}
                  style={{
                    width: 52, height: 88, borderRadius: 8,
                    border: `4px ${c === 'open' ? 'solid' : 'dashed'} ${c === 'open' ? OPEN : OCC}`,
                    background: c === 'open' ? 'rgba(48,164,108,0.18)' : 'rgba(229,72,77,0.18)',
                  }}
                />
              ))}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 24, marginTop: 10, fontSize: 20, color: '#a3a6ad' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: OPEN }} />
              6 open
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: OCC }} />
              10 occupied
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
