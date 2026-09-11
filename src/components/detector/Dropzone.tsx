'use client';

import { useCallback, useRef, useState } from 'react';

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 32 * 1024 * 1024;

export function Dropzone({
  onFile,
  disabled,
}: {
  onFile: (f: File) => void;
  disabled?: boolean;
}) {
  const [over, setOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback(
    (f: File | undefined) => {
      if (!f) return;
      if (!ACCEPT.includes(f.type)) {
        setErr('That file type is not supported — use a PNG, JPEG or WebP.');
        return;
      }
      if (f.size > MAX_BYTES) {
        setErr('That image is over 32MB. Try a smaller one.');
        return;
      }
      setErr(null);
      onFile(f);
    },
    [onFile],
  );

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) accept(e.dataTransfer.files?.[0]);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center transition-colors"
        style={{
          background: over ? 'var(--color-open-soft)' : 'var(--bg-raised)',
          borderColor: over ? 'var(--color-open)' : 'var(--border-strong)',
          opacity: disabled ? 0.55 : 1,
        }}
      >
        <p className="text-sm font-medium">Drop a photo, or click to choose</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-faint)' }}>
          PNG, JPEG or WebP · stays on your device
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(',')}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            accept(e.target.files?.[0]);
            // Reset so picking the same file twice still fires onChange.
            e.target.value = '';
          }}
        />
      </div>
      {err && (
        <p role="alert" className="mt-2 text-xs" style={{ color: 'var(--color-occupied)' }}>
          {err}
        </p>
      )}
    </div>
  );
}
