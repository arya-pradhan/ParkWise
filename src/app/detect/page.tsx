'use client';

import dynamic from 'next/dynamic';
import { Container } from '@/components/site/Container';
import { DetectorProvider } from '@/lib/hooks/useDetector';

// No meaningful server render here: this is canvas, ImageBitmap and a Web
// Worker. (onnxruntime-web itself is confined to the worker, so this isn't
// about the ORT import — it's about the DOM APIs.)
const ImageDetector = dynamic(
  () => import('@/components/detector/ImageDetector').then((m) => m.ImageDetector),
  { ssr: false },
);

export default function DetectPage() {
  return (
    <Container className="py-10">
      <header className="mb-7 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Image detector</h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Pick a sample or drop in your own photo. The model runs on your device
          — nothing is uploaded. Hover any box to inspect it, and move the
          thresholds to watch the counts respond without the model re-running.
        </p>
      </header>

      <DetectorProvider>
        <ImageDetector />
      </DetectorProvider>
    </Container>
  );
}
