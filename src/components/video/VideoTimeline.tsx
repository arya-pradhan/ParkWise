'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { FramePoint, VideoAnalysis } from '@/lib/hooks/useVideoDetection';

const W = 800;
const H = 180;
const PAD = { top: 12, right: 12, bottom: 24, left: 36 };

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Occupancy over time. One area, two count lines, a playhead — no charting
 * dependency. Clicking or dragging on the chart seeks the video; playback
 * moves the playhead. The two directions share `currentTime`.
 */
export function VideoTimeline({
  analysis,
  duration,
  currentTime,
  onSeek,
  pending = false,
}: {
  analysis: VideoAnalysis;
  duration: number;
  currentTime: number;
  onSeek: (t: number) => void;
  pending?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<FramePoint | null>(null);
  const { points } = analysis;

  const x = useCallback(
    (t: number) => PAD.left + (duration > 0 ? (t / duration) : 0) * (W - PAD.left - PAD.right),
    [duration],
  );
  const y = useCallback((rate: number) => PAD.top + (1 - rate) * (H - PAD.top - PAD.bottom), []);

  const maxCount = useMemo(
    () => Math.max(1, ...points.map((p) => p.stats.total)),
    [points],
  );
  const yCount = useCallback(
    (n: number) => PAD.top + (1 - n / maxCount) * (H - PAD.top - PAD.bottom),
    [maxCount],
  );

  const area = useMemo(() => {
    if (points.length < 2) return '';
    const top = points.map((p) => `${x(p.time).toFixed(1)},${y(p.stats.occupancyRate).toFixed(1)}`).join(' L');
    const base = y(0);
    return `M${x(points[0].time).toFixed(1)},${base} L${top} L${x(points[points.length - 1].time).toFixed(1)},${base} Z`;
  }, [points, x, y]);

  const line = (pick: (p: FramePoint) => number) =>
    points.length < 2 ? '' : 'M' + points.map((p) => `${x(p.time).toFixed(1)},${yCount(pick(p)).toFixed(1)}`).join(' L');

  const openLine = useMemo(() => line((p) => p.stats.open), [points, yCount, x]); // eslint-disable-line react-hooks/exhaustive-deps
  const occLine = useMemo(() => line((p) => p.stats.occupied), [points, yCount, x]); // eslint-disable-line react-hooks/exhaustive-deps

  const timeFromEvent = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return 0;
      const rect = svg.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const frac = (px - PAD.left) / (W - PAD.left - PAD.right);
      return Math.max(0, Math.min(duration, frac * duration));
    },
    [duration],
  );

  const nearest = useCallback(
    (t: number) => {
      let best: FramePoint | null = null;
      let bd = Infinity;
      for (const p of points) {
        const d = Math.abs(p.time - t);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    },
    [points],
  );

  const dragging = useRef(false);

  return (
    <div className="rounded-xl border p-4" style={{ background: 'var(--bg-raised)', boxShadow: 'var(--shadow)' }}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Occupancy over time</h3>
        <div className="flex gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm" style={{ background: 'var(--color-occupied-soft)', outline: '1px solid var(--color-occupied)' }} />
            % full
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3" style={{ background: 'var(--color-open)' }} />
            open
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3" style={{ background: 'var(--color-occupied)' }} />
            occupied
          </span>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        style={{ cursor: points.length ? 'crosshair' : 'default', opacity: pending ? 0.7 : 1 }}
        role="img"
        aria-label="Chart of parking occupancy over the course of the video; click to seek"
        onPointerDown={(e) => {
          if (!points.length) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          onSeek(timeFromEvent(e));
        }}
        onPointerMove={(e) => {
          if (!points.length) return;
          const t = timeFromEvent(e);
          setHover(nearest(t));
          if (dragging.current) onSeek(t);
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerLeave={() => { setHover(null); dragging.current = false; }}
      >
        {/* gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((r) => (
          <g key={r}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(r)} y2={y(r)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(r) + 3.5} fontSize={10} textAnchor="end" fill="var(--text-faint)" className="tnum">
              {Math.round(r * 100)}%
            </text>
          </g>
        ))}

        {/* occupancy area */}
        {area && <path d={area} fill="var(--color-occupied-soft)" />}
        {area && (
          <path
            d={area.replace(/^M[^L]+L/, 'M').replace(/ L[^L]+ Z$/, '')}
            fill="none" stroke="var(--color-occupied)" strokeWidth={1.5} strokeOpacity={0.9}
          />
        )}

        {/* count lines, on their own scale */}
        {openLine && <path d={openLine} fill="none" stroke="var(--color-open)" strokeWidth={1.5} strokeDasharray="3 3" />}
        {occLine && <path d={occLine} fill="none" stroke="var(--color-occupied)" strokeWidth={1.5} strokeDasharray="3 3" />}

        {/* x-axis */}
        {duration > 0 && [0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text key={f} x={x(f * duration)} y={H - 6} fontSize={10} textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'} fill="var(--text-faint)" className="tnum">
            {fmt(f * duration)}
          </text>
        ))}

        {/* hover marker */}
        {hover && (
          <g>
            <line x1={x(hover.time)} x2={x(hover.time)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--text-faint)" strokeWidth={1} strokeDasharray="2 2" />
            <circle cx={x(hover.time)} cy={y(hover.stats.occupancyRate)} r={3.5} fill="var(--color-occupied)" />
          </g>
        )}

        {/* playhead */}
        {duration > 0 && (
          <line
            x1={x(currentTime)} x2={x(currentTime)} y1={PAD.top} y2={H - PAD.bottom}
            stroke="var(--accent)" strokeWidth={2}
          />
        )}

        {points.length === 0 && (
          <text x={W / 2} y={H / 2} fontSize={12} textAnchor="middle" fill="var(--text-faint)">
            Analyze a video to see occupancy over time
          </text>
        )}
      </svg>

      <div className="mt-1 flex h-5 items-center justify-between text-xs tnum" style={{ color: 'var(--text-muted)' }}>
        <span>
          {hover
            ? `${fmt(hover.time)} · ${Math.round(hover.stats.occupancyRate * 100)}% full · ${hover.stats.open} open / ${hover.stats.occupied} occupied`
            : duration > 0 ? `${fmt(currentTime)} / ${fmt(duration)}` : ''}
        </span>
        {points.length > 0 && <span>{points.length} frames analyzed</span>}
      </div>
    </div>
  );
}
