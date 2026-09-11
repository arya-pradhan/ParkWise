import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { ModelBenchmark } from './ModelBenchmark';

export const metadata: Metadata = {
  title: 'Model card',
  description:
    'Architecture, training data, measured limitations and in-browser latency of the ParkWise YOLOv5s parking detector.',
};

export default function ModelPage() {
  return (
    <Container className="py-10">
      <header className="mb-10 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Model card</h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          A small object detector trained on a small, narrow dataset. This page
          says what it is, what it was trained on, where it breaks, and how fast
          it runs on the device you are reading this on.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-10">
          <Section title="Overview">
            <p>
              ParkWise detects parking spaces in an overhead photo and labels
              each one <Tag kind="occupied">Occupied</Tag> or <Tag kind="open">Open</Tag>.
              It is a YOLOv5s detector fine-tuned in July 2022 as an AI Camp
              summer project, and it now runs entirely in the browser via ONNX.
            </p>
            <p>
              <strong>Intended use:</strong> a demonstration of browser-native
              inference and an approximate read of how full a lot is.
            </p>
            <p>
              <strong>Not intended for:</strong> enforcement, billing, safety
              decisions, or any situation where a miscount has consequences. See
              the limitations below — they are substantial.
            </p>
          </Section>

          <Section title="Architecture">
            <Facts
              rows={[
                ['Family', 'YOLOv5s (Ultralytics), v6.x-era checkpoint'],
                ['Size', '213 layers · 7,015,519 parameters · 15.8 GFLOPs at 416'],
                ['Backbone', 'CSPDarknet with C3 blocks and SPPF'],
                ['Neck', 'PANet'],
                ['Heads', '3 detection heads at strides 8 / 16 / 32, 3 anchors each'],
                ['Scaling', 'depth_multiple 0.33 · width_multiple 0.50'],
                ['Anchors', 'Stock YOLOv5 defaults (not evolved on this data)'],
                ['Classes', '0 = Occupied-Parking-Spaces · 1 = Open-Parking-Spaces'],
              ]}
            />
          </Section>

          <Section title="Training data">
            <p>
              Roughly 250 frames from a single GoPro mounted above one parking
              lot, labeled with bounding boxes in Roboflow and split into
              train / validation / test. Checkpoint dated 2022-07-07. Trained at
              416×416.
            </p>
            <p>
              That is a very small dataset from a single camera. The model has
              learned that lot, that lens, that vantage point and that lighting.
              It has not learned &ldquo;parking lots&rdquo; in general.
            </p>
          </Section>

          <Section title="Validation">
            <p>
              The confusion matrix from the original training run, on the
              held-out validation split. Read it with the dataset size in mind —
              with a validation set this small, individual cells are noisy and
              the numbers should not be quoted as accuracy claims.
            </p>
            <div className="overflow-hidden rounded-xl border" style={{ background: 'white' }}>
              <Image
                src="/model-card/confusion_matrix.png"
                alt="Confusion matrix for the two classes plus background, from the 2022 validation split"
                width={1200}
                height={900}
                className="h-auto w-full"
              />
            </div>
            <p>
              Qualitatively, on the sample images in this app: the model
              separates the two classes reliably — a lot named &ldquo;empty&rdquo;
              reads as 5% full and one named &ldquo;full&rdquo; reads as 71% — but
              it produces many overlapping duplicate boxes on open spaces, and
              its absolute counts should be treated as approximate.
            </p>
          </Section>

          <Section title="Limitations">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>One lot, one camera.</strong> Recall drops sharply on
                other lots, ground-level views, or phone photos. On oblique
                footage it has labeled rooftops and truck beds as open spaces.
              </li>
              <li>
                <strong>Daytime only.</strong> No night, rain or snow in the
                training data.
              </li>
              <li>
                <strong>Duplicate boxes.</strong> Open spaces frequently get
                several overlapping detections, which inflates the open count.
                Raising the IoU threshold suppresses more of them.
              </li>
              <li>
                <strong>Boundary confusion.</strong> Adjacent spaces are
                sometimes merged into one box or split across two.
              </li>
              <li>
                <strong>Input size is 416.</strong> Exporting at 640 was tested
                and rejected: it hallucinated occupied spaces on empty asphalt.
              </li>
            </ul>
          </Section>

          <Section title="How it runs in the browser">
            <Facts
              rows={[
                ['Export', 'PyTorch → ONNX opset 12, static 1×3×416×416, simplified'],
                ['Weight', '27 MB fp32, content-hashed and cached immutably'],
                ['Runtime', 'onnxruntime-web · WebGPU where available, else WebAssembly'],
                ['Threads', 'Multi-threaded WASM when the page is cross-origin isolated'],
                ['Preprocess', 'Letterbox to 416, pad rgb(114,114,114), RGB /255, NCHW'],
                ['Output', '1 × 10647 × 7 — (52² + 26² + 13²) × 3 anchors; xywh + obj + 2 classes'],
                ['Decode', 'Objectness prefilter → class-wise NMS (IoU 0.45) → un-letterbox'],
              ]}
            />
            <p>
              The Detect layer&rsquo;s decode is inside the exported graph, so
              the browser receives pixel-space boxes and only has to threshold,
              suppress and rescale. Browser output is checked against the
              PyTorch reference on a fixture image — letterbox geometry matches
              exactly, counts match exactly, and boxes land within 3 px.
            </p>
          </Section>

          <Section title="Provenance">
            <p>
              Built in 2022 by Arya Pradhan, Akira Suzuki, Alex Loan, Dev Patel,
              Leo Tjong and Prisha Sharma through AI Camp. The original Flask
              app ran this model server-side with PyTorch; it is archived in
              the repository under <code>legacy/</code>. Rebuilt for the browser in
              2026.
            </p>
            <p>
              Detector architecture and export tooling from{' '}
              <a
                href="https://github.com/ultralytics/yolov5"
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-2"
              >
                Ultralytics YOLOv5
              </a>{' '}
              (AGPL-3.0).
            </p>
          </Section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <ModelBenchmark />
          <div className="rounded-xl border p-5 text-sm" style={{ background: 'var(--bg-sunken)' }}>
            <p className="font-medium">Try it</p>
            <p className="mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              The sample gallery includes the empty and full lots quoted above,
              and two phone photos that show the model out of its comfort zone.
            </p>
            <Link href="/detect" className="mt-3 inline-block text-sm font-medium underline underline-offset-2">
              Open the detector →
            </Link>
          </div>
        </aside>
      </div>
    </Container>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {children}
      </div>
    </section>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 rounded-xl border p-4 text-sm" style={{ background: 'var(--bg-raised)' }}>
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt style={{ color: 'var(--text-faint)' }}>{k}</dt>
          <dd className="tnum" style={{ color: 'var(--text)' }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Tag({ kind, children }: { kind: 'open' | 'occupied'; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium"
      style={{
        background: kind === 'open' ? 'var(--color-open-soft)' : 'var(--color-occupied-soft)',
        color: 'var(--text)',
      }}
    >
      <span className="size-1.5 rounded-full" style={{ background: kind === 'open' ? 'var(--color-open)' : 'var(--color-occupied)' }} />
      {children}
    </span>
  );
}
