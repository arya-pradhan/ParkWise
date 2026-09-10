'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DetectorClient } from '@/lib/detect/client';
import { MODEL_URL } from '@/lib/detect/constants';
import type { ExecutionProvider } from '@/lib/detect/types';

export type DetectorStatus = 'idle' | 'loading' | 'ready' | 'error';

interface DetectorContextValue {
  client: DetectorClient | null;
  status: DetectorStatus;
  ep: ExecutionProvider | null;
  error: string | null;
  threads: number;
  isolated: boolean;
}

const DetectorContext = createContext<DetectorContextValue>({
  client: null,
  status: 'idle',
  ep: null,
  error: null,
  threads: 1,
  isolated: false,
});

/**
 * Creates the detector worker once and shares it across routes, so navigating
 * /detect -> /detect/video does not re-download the 27MB model.
 */
export function DetectorProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DetectorStatus>('idle');
  const [ep, setEp] = useState<ExecutionProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<DetectorClient | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    const client = new DetectorClient(MODEL_URL);
    clientRef.current = client;
    force((n) => n + 1);

    client
      .ready()
      .then((provider) => {
        if (cancelled) return;
        setEp(provider);
        setStatus('ready');
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setStatus('error');
      });

    return () => {
      cancelled = true;
      client.destroy();
      clientRef.current = null;
    };
  }, []);

  const isolated =
    typeof globalThis !== 'undefined' && Boolean(globalThis.crossOriginIsolated);

  const value = useMemo<DetectorContextValue>(
    () => ({
      client: clientRef.current,
      status,
      ep,
      error,
      isolated,
      threads: isolated
        ? Math.min(4, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4)
        : 1,
    }),
    [status, ep, error, isolated],
  );

  return (
    <DetectorContext.Provider value={value}>{children}</DetectorContext.Provider>
  );
}

export function useDetector() {
  return useContext(DetectorContext);
}
