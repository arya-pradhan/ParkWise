import Link from 'next/link';
import { Container } from '@/components/site/Container';

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <Container className="pt-16 pb-14 sm:pt-24 sm:pb-20">
          <div className="max-w-2xl">
            <p
              className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
              style={{ background: 'var(--bg-raised)', color: 'var(--text-muted)' }}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ background: 'var(--color-open)' }}
              />
              Runs entirely in your browser
            </p>

            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
              Find the open spaces
              <br />
              in a parking lot.
            </h1>

            <p
              className="mt-5 text-lg leading-relaxed"
              style={{ color: 'var(--text-muted)' }}
            >
              Drop in a photo of a lot. A YOLOv5s detector counts which spaces
              are free and which are taken, and shows you exactly where they
              are — without your image ever leaving your device.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/detect"
                className="rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: 'var(--color-open)' }}
              >
                Try it on a photo
              </Link>
              <Link
                href="/model"
                className="rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors"
                style={{ background: 'var(--bg-raised)' }}
              >
                How it works
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <Container>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div
              key={s.title}
              className="rounded-xl border p-5"
              style={{ background: 'var(--bg-raised)', boxShadow: 'var(--shadow)' }}
            >
              <div
                className="mb-3 flex size-7 items-center justify-center rounded-md text-xs font-semibold tnum"
                style={{ background: 'var(--bg-sunken)', color: 'var(--text-muted)' }}
              >
                {i + 1}
              </div>
              <h3 className="mb-1.5 text-sm font-semibold">{s.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </Container>

      <Container className="mt-16">
        <div
          className="rounded-xl border p-6 sm:p-8"
          style={{ background: 'var(--bg-sunken)' }}
        >
          <h2 className="text-lg font-semibold tracking-tight">
            Nothing is uploaded
          </h2>
          <p
            className="mt-2 max-w-2xl text-sm leading-relaxed"
            style={{ color: 'var(--text-muted)' }}
          >
            The model is downloaded once and runs on your own hardware, through
            WebGPU where it is available and WebAssembly everywhere else. There
            is no server to send an image to — this site is static files. The
            2022 version of this project uploaded every photo to a Flask server
            running PyTorch; that server no longer exists.
          </p>
        </div>
      </Container>
    </>
  );
}

const STEPS = [
  {
    title: 'Pick a photo',
    body: 'Use one of the sample lots, or drop in your own. Overhead views work best — that is what the model was trained on.',
  },
  {
    title: 'It runs locally',
    body: 'A 27MB detector loads once, then each image is letterboxed and passed through the network right in the page.',
  },
  {
    title: 'Read the lot',
    body: 'Every detected space is drawn and counted, with sliders to tighten or loosen the thresholds and watch the result change.',
  },
];
