'use client';

import type { Detection } from '@/lib/detect/types';

/**
 * Also serves as the accessible equivalent of the canvas — a <canvas> is opaque
 * to screen readers, so this table is where the detections are actually
 * readable.
 */
export function DetectionList({
  detections,
  hoveredId,
  onHover,
}: {
  detections: Detection[];
  hoveredId: number | null;
  onHover: (id: number | null) => void;
}) {
  if (detections.length === 0) return null;

  return (
    <div className="rounded-xl border" style={{ background: 'var(--bg-raised)' }}>
      <div className="flex items-baseline justify-between px-5 py-3.5">
        <h3 className="text-sm font-semibold">Detections</h3>
        <span className="text-xs tnum" style={{ color: 'var(--text-faint)' }}>
          {detections.length}
        </span>
      </div>
      <div className="max-h-72 overflow-y-auto border-t">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Every detected parking space with its class and confidence
          </caption>
          <thead className="sr-only">
            <tr><th>Space</th><th>Status</th><th>Confidence</th></tr>
          </thead>
          <tbody>
            {detections.map((d, i) => {
              const open = d.classId === 1;
              const hot = d.id === hoveredId;
              return (
                <tr
                  key={d.id}
                  onMouseEnter={() => onHover(d.id)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(d.id)}
                  onBlur={() => onHover(null)}
                  tabIndex={0}
                  className="cursor-default border-b last:border-b-0 outline-none"
                  style={{ background: hot ? 'var(--bg-sunken)' : 'transparent' }}
                >
                  <td className="py-1.5 pl-5 pr-2 tnum" style={{ color: 'var(--text-faint)' }}>
                    {i + 1}
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-[3px]"
                        style={{ background: open ? 'var(--color-open)' : 'var(--color-occupied)' }}
                      />
                      {open ? 'Open' : 'Occupied'}
                    </span>
                  </td>
                  <td className="py-1.5 pr-5 text-right tnum" style={{ color: 'var(--text-muted)' }}>
                    {Math.round(d.score * 100)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
