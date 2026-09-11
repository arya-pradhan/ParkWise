'use client';

import type { FilterParams } from '@/lib/detect/types';

/**
 * These sliders re-filter the cached raw tensor; the model does not re-run.
 * That is why they can be continuous rather than "apply"-gated.
 */
export function ThresholdControls({
  params,
  onChange,
  minConf = 0,
  disabled = false,
}: {
  params: FilterParams;
  onChange: (p: FilterParams) => void;
  minConf?: number;
  disabled?: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{ background: 'var(--bg-raised)' }}
    >
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Thresholds</h3>
        <button
          type="button"
          onClick={() => onChange({ conf: 0.25, iou: 0.45, maxDet: 300 })}
          className="text-xs underline-offset-2 hover:underline"
          style={{ color: 'var(--text-faint)' }}
          disabled={disabled}
        >
          Reset
        </button>
      </div>

      <Slider
        id="conf"
        label="Confidence"
        hint="How sure the model must be before a space is counted."
        value={params.conf}
        min={minConf}
        max={0.95}
        step={0.01}
        disabled={disabled}
        onChange={(conf) => onChange({ ...params, conf })}
      />

      <Slider
        id="iou"
        label="Overlap (IoU)"
        hint="How much two boxes may overlap before the weaker one is dropped."
        value={params.iou}
        min={0.1}
        max={0.9}
        step={0.01}
        disabled={disabled}
        onChange={(iou) => onChange({ ...params, iou })}
      />

      {minConf > 0 && (
        <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-faint)' }}>
          In video mode the confidence floor is {Math.round(minConf * 100)}% —
          only rows above it are cached per frame, to keep memory bounded.
        </p>
      )}
    </div>
  );
}

function Slider({
  id, label, hint, value, min, max, step, onChange, disabled,
}: {
  id: string; label: string; hint: string;
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm">{label}</label>
        <span className="text-sm tnum" style={{ color: 'var(--text-muted)' }}>
          {Math.round(value * 100)}%
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--accent)]"
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-faint)' }}>
        {hint}
      </p>
    </div>
  );
}
