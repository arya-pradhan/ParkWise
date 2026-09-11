'use client';

import dynamic from 'next/dynamic';
import { DetectorProvider } from '@/lib/hooks/useDetector';

// The model page is otherwise a static server component; only the benchmark
// needs the worker, so it gets its own client island.
const LiveLatency = dynamic(
  () => import('@/components/model/LiveLatency').then((m) => m.LiveLatency),
  { ssr: false },
);

export function ModelBenchmark() {
  return (
    <DetectorProvider>
      <LiveLatency />
    </DetectorProvider>
  );
}
