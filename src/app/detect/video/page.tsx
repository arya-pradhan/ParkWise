'use client';

import dynamic from 'next/dynamic';
import { Container } from '@/components/site/Container';
import { DetectorProvider } from '@/lib/hooks/useDetector';

const VideoDetector = dynamic(
  () => import('@/components/video/VideoDetector').then((m) => m.VideoDetector),
  { ssr: false },
);

export default function VideoPage() {
  return (
    <Container className="py-10">
      <header className="mb-7 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Video timeline</h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Drop in a clip of a lot. The detector samples frames across it and
          charts how full the lot is over time — click anywhere on the chart to
          jump the video there. Everything runs on your device.
        </p>
      </header>

      <DetectorProvider>
        <VideoDetector />
      </DetectorProvider>
    </Container>
  );
}
