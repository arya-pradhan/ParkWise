'use client';

import type { OccupancyStats as Stats } from '@/lib/detect/types';

/**
 * The headline result. The 2022 app rendered a sentence and threw the
 * coordinates away; these are the numbers a parking tool actually exists to
 * report.
 */
export function OccupancyStats({ stats }: { stats: Stats }) {
  const { open, occupied, total, occupancyRate } = stats;

  if (total === 0) {
    return (
      <div
        className="rounded-xl border p-5 text-sm"
        style={{ background: 'var(--bg-raised)', color: 'var(--text-muted)' }}
      >
        <p className="font-medium" style={{ color: 'var(--text)' }}>
          No spaces detected
        </p>
        <p className="mt-1.5 leading-relaxed">
          Try lowering the confidence threshold, or pick a more overhead view —
          the model was trained on aerial shots of a single lot.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border p-5"
      style={{ background: 'var(--bg-raised)', boxShadow: 'var(--shadow)' }}
    >
      <div className="flex items-center gap-5">
        <Donut rate={occupancyRate} />
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-none tracking-tight tnum">
            <span style={{ color: 'var(--color-open)' }}>{open}</span>
            <span
              className="text-base font-normal"
              style={{ color: 'var(--text-faint)' }}
            >
              {' '}
              of {total} free
            </span>
          </p>
          <p className="mt-2 text-sm tnum" style={{ color: 'var(--text-muted)' }}>
            {Math.round(occupancyRate * 100)}% full · {occupied} taken
          </p>
        </div>
      </div>

      <div className="mt-4 flex h-2 overflow-hidden rounded-full" style={{ background: 'var(--bg-sunken)' }}>
        <div
          style={{ width: `${(occupied / total) * 100}%`, background: 'var(--color-occupied)' }}
          aria-hidden="true"
        />
        <div
          style={{ width: `${(open / total) * 100}%`, background: 'var(--color-open)' }}
          aria-hidden="true"
        />
      </div>

      <div className="mt-3 flex gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        <Key color="var(--color-open)" label={`${open} open`} />
        <Key color="var(--color-occupied)" label={`${occupied} occupied`} />
      </div>
    </div>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 tnum">
      <span className="size-2 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}

function Donut({ rate, size = 64 }: { rate: number; size?: number }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 -rotate-90"
      role="img"
      aria-label={`${Math.round(rate * 100)} percent full`}
    >
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="var(--color-open)" strokeWidth={stroke}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="var(--color-occupied)" strokeWidth={stroke}
        strokeDasharray={`${c * rate} ${c}`}
        strokeLinecap="butt"
      />
    </svg>
  );
}
