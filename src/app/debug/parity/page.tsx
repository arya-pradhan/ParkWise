'use client';

import dynamic from 'next/dynamic';
import { Container } from '@/components/site/Container';
import { DetectorProvider } from '@/lib/hooks/useDetector';

const ParityHarness = dynamic(
  () => import('@/components/debug/ParityHarness').then((m) => m.ParityHarness),
  { ssr: false },
);

export default function ParityPage() {
  return (
    <Container className="py-10">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Browser parity check</h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Runs the full browser path — <code>&lt;img&gt;</code> →{' '}
          <code>createImageBitmap</code> → canvas letterbox → worker → decode —
          against the fixture produced by <code>tools/export/verify_parity.py</code>,
          which used PyTorch and yolov5&rsquo;s own NMS.
        </p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Canvas <code>drawImage</code> downscaling is not bit-identical to cv2&rsquo;s
          <code> INTER_LINEAR</code>, so small drift is expected and tolerated at
          3px / 0.025. Anything larger means the letterbox math is wrong, not resampling.
        </p>
      </header>
      <DetectorProvider>
        <ParityHarness />
      </DetectorProvider>
    </Container>
  );
}
