'use client';

import { useEffect, useState } from 'react';

export interface Sample {
  file: string;
  id: string;
  title: string;
  caption: string;
  width: number;
  height: number;
  featured: boolean;
  expected: { occupied: number; open: number; total: number; occupancyRate: number };
}

/**
 * Most visitors do not have a parking lot photo to hand, so without this the
 * page is an empty dropzone and the model never gets seen.
 */
export function SampleGallery({
  selectedId,
  onPick,
  disabled,
}: {
  selectedId: string | null;
  onPick: (s: Sample) => void;
  disabled?: boolean;
}) {
  const [samples, setSamples] = useState<Sample[]>([]);

  useEffect(() => {
    let alive = true;
    fetch('/samples/manifest.json')
      .then((r) => r.json())
      .then((d: Sample[]) => alive && setSamples(d))
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (samples.length === 0) return null;

  return (
    <section aria-labelledby="samples-heading">
      <h2 id="samples-heading" className="mb-3 text-sm font-semibold">
        Sample lots
      </h2>
      <ul className="flex snap-x gap-3 overflow-x-auto pb-2">
        {samples.map((s) => {
          const active = s.id === selectedId;
          return (
            <li key={s.id} className="shrink-0 snap-start">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(s)}
                aria-pressed={active}
                className="group block w-36 overflow-hidden rounded-lg border text-left transition-opacity disabled:opacity-50"
                style={{
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  outline: active ? '1px solid var(--accent)' : 'none',
                  background: 'var(--bg-raised)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.file}
                  alt=""
                  width={s.width}
                  height={s.height}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                <span className="block px-2.5 py-2">
                  <span className="block truncate text-xs font-medium">{s.title}</span>
                  <span
                    className="block truncate text-[11px] tnum"
                    style={{ color: 'var(--text-faint)' }}
                  >
                    {s.caption}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
