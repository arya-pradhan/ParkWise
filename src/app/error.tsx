'use client';

import { useEffect } from 'react';
import { Container } from '@/components/site/Container';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="py-20">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">Something broke</h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {error.message || 'An unexpected error occurred.'}
        </p>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-faint)' }}>
          The detector runs entirely on your device, so this is usually a memory
          limit — a very large image, or a phone with little to spare. Reloading
          clears it.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: 'var(--accent)' }}
        >
          Try again
        </button>
      </div>
    </Container>
  );
}
