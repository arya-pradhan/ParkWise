'use client';

import { useDetector } from '@/lib/hooks/useDetector';

export function ModelStatus({ inferenceMs }: { inferenceMs?: number | null }) {
  const { status, ep, error, threads, isolated } = useDetector();

  const dot =
    status === 'ready' ? 'var(--color-open)'
    : status === 'error' ? 'var(--color-occupied)'
    : 'var(--text-faint)';

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border px-4 py-2.5 text-xs"
      style={{ background: 'var(--bg-raised)', color: 'var(--text-muted)' }}
    >
      <span className="inline-flex items-center gap-2">
        <span
          className="size-2 rounded-full"
          style={{
            background: dot,
            animation: status === 'loading' ? 'pulse 1.6s ease-in-out infinite' : undefined,
          }}
        />
        {status === 'loading' && 'Loading model (27MB, cached after first visit)…'}
        {status === 'ready' && 'Model ready'}
        {status === 'error' && `Model failed: ${error}`}
        {status === 'idle' && 'Starting…'}
      </span>

      {status === 'ready' && ep && (
        <>
          <span className="tnum">
            Backend <strong style={{ color: 'var(--text)' }}>{ep === 'webgpu' ? 'WebGPU' : 'WASM'}</strong>
            {ep === 'wasm' && ` · ${threads} thread${threads === 1 ? '' : 's'}`}
          </span>
          {!isolated && ep === 'wasm' && (
            <span title="Cross-origin isolation is unavailable in this browser, so SharedArrayBuffer and multi-threading are off.">
              single-threaded
            </span>
          )}
          {typeof inferenceMs === 'number' && (
            <span className="tnum">
              Last inference <strong style={{ color: 'var(--text)' }}>{inferenceMs.toFixed(0)}ms</strong>
            </span>
          )}
        </>
      )}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
    </div>
  );
}
