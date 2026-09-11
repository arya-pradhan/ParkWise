'use client';

import { useCallback, useState } from 'react';
import { useDetector } from '@/lib/hooks/useDetector';
import { toBitmap } from '@/lib/detect/preprocess';

const WARMUP = 3;
const TIMED = 10;

interface Result {
  ep: string;
  threads: number;
  isolated: boolean;
  p50: number;
  p95: number;
  min: number;
  samples: number[];
  ua: string;
}

/**
 * Turns the model card from a spec sheet into a benchmark the visitor just
 * ran on their own hardware. Warm-up runs are discarded because the first
 * inferences on WebGPU include shader compilation and on WASM include JIT.
 */
export function LiveLatency() {
  const { client, status, ep, threads, isolated } = useDetector();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!client || status !== 'ready') return;
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(0);

    try {
      const blob = await (await fetch('/samples/GOPR6541.jpg')).blob();
      const total = WARMUP + TIMED;
      const samples: number[] = [];

      for (let i = 0; i < total; i++) {
        // A fresh bitmap per run: the worker closes each one it receives.
        const bitmap = await toBitmap(blob);
        const out = await client.infer(bitmap, bitmap.width, bitmap.height);
        if (i >= WARMUP) samples.push(out.inferenceMs);
        setProgress((i + 1) / total);
      }

      const sorted = [...samples].sort((a, b) => a - b);
      const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
      setResult({
        ep: ep ?? 'unknown',
        threads,
        isolated,
        p50: q(0.5),
        p95: q(0.95),
        min: sorted[0],
        samples,
        ua: navigator.userAgent,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [client, status, ep, threads, isolated]);

  return (
    <div
      className="rounded-xl border p-5"
      style={{ background: 'var(--bg-raised)', boxShadow: 'var(--shadow)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Measure it on your device</h3>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            {WARMUP} warm-up runs discarded, then {TIMED} timed inferences on a 640×480 sample.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={status !== 'ready' || running}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
        >
          {running
            ? `Running… ${Math.round(progress * 100)}%`
            : status === 'ready'
              ? result ? 'Run again' : 'Run benchmark'
              : status === 'loading' ? 'Loading model…' : 'Unavailable'}
        </button>
      </div>

      {running && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--bg-sunken)' }}>
          <div
            className="h-full transition-[width] duration-150"
            style={{ width: `${progress * 100}%`, background: 'var(--accent)' }}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm" style={{ color: 'var(--color-occupied)' }}>{error}</p>
      )}

      {result && (
        <div className="mt-5">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="p50" value={result.p50} />
            <Stat label="p95" value={result.p95} />
            <Stat label="best" value={result.min} />
          </div>

          <div className="mt-4 flex h-10 items-end gap-1" aria-hidden="true">
            {result.samples.map((ms, i) => (
              <div
                key={i}
                title={`${ms.toFixed(1)}ms`}
                className="flex-1 rounded-t-sm"
                style={{
                  height: `${Math.max(8, (ms / Math.max(...result.samples)) * 100)}%`,
                  background: 'var(--accent)',
                  opacity: 0.75,
                }}
              />
            ))}
          </div>

          <dl className="mt-4 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2" style={{ color: 'var(--text-muted)' }}>
            <dt>Backend</dt>
            <dd className="tnum" style={{ color: 'var(--text)' }}>
              {result.ep === 'webgpu' ? 'WebGPU' : `WebAssembly · ${result.threads} thread${result.threads === 1 ? '' : 's'}`}
            </dd>
            <dt>Cross-origin isolated</dt>
            <dd style={{ color: 'var(--text)' }}>{result.isolated ? 'yes' : 'no — single-threaded'}</dd>
            <dt>Browser</dt>
            <dd className="truncate" style={{ color: 'var(--text)' }} title={result.ua}>{shortUa(result.ua)}</dd>
          </dl>

          <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-faint)' }}>
            Inference only — excludes image decode, letterboxing and drawing.
            Nothing about this run is sent anywhere.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border px-3 py-2.5" style={{ background: 'var(--bg-sunken)' }}>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>{label}</div>
      <div className="mt-0.5 text-xl font-semibold tnum">
        {value.toFixed(0)}<span className="text-sm font-normal" style={{ color: 'var(--text-muted)' }}>ms</span>
      </div>
    </div>
  );
}

function shortUa(ua: string) {
  const m =
    ua.match(/(Edg|Chrome|Firefox|Safari)\/([\d.]+)/) ??
    ua.match(/(Version)\/([\d.]+).*Safari/);
  if (!m) return ua.slice(0, 40);
  const name = m[1] === 'Edg' ? 'Edge' : m[1] === 'Version' ? 'Safari' : m[1];
  return `${name} ${m[2].split('.')[0]}`;
}
