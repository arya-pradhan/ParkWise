'use client';

import { useEffect, useState } from 'react';
import { useDetector } from '@/lib/hooks/useDetector';
import { decode, computeStats } from '@/lib/detect/postprocess';
import { toBitmap } from '@/lib/detect/preprocess';
import type { Detection, LetterboxInfo } from '@/lib/detect/types';

/** Mirrors tools/export/fixtures/<stem>.expected.json. */
interface Expected {
  image: string;
  letterbox: LetterboxInfo;
  params: { conf: number; iou: number; maxDet: number };
  counts: { total: number; occupied: number; open: number };
  detections: {
    classId: number;
    score: number;
    box: { x1: number; y1: number; x2: number; y2: number };
  }[];
}

/**
 * Canvas drawImage is not bit-identical to cv2 INTER_LINEAR, so a little drift
 * is expected. Beyond these bounds the letterbox math itself is wrong.
 *
 * Measured, not guessed: with imageSmoothingQuality 'low' (bilinear, matching
 * cv2) the GOPR6541 fixture lands at max 2.71px / 0.019 across 52 boxes, with
 * p50 0.47px / 0.003, and identical counts. With 'high' (Lanczos) it was 79px
 * / 0.18 and dropped a detection — which is why preprocess.ts uses 'low'.
 */
const BOX_TOL_PX = 3;
const SCORE_TOL = 0.025;

interface Row {
  i: number;
  ok: boolean;
  cls: string;
  score: [number, number];
  dBox: number;
  dScore: number;
}

interface Report {
  ep: string;
  inferenceMs: number;
  letterbox: { mine: LetterboxInfo; theirs: LetterboxInfo; ok: boolean };
  counts: { mine: { total: number; occupied: number; open: number }; theirs: Expected['counts']; ok: boolean };
  rows: Row[];
  unmatched: number;
  pass: boolean;
}

export function ParityHarness() {
  const { client, status, ep } = useDetector();
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'ready' || !client) return;
    let alive = true;

    (async () => {
      try {
        const expected: Expected = await (
          await fetch('/debug/GOPR6541.expected.json')
        ).json();

        // Full browser path, identical to what /detect does.
        const blob = await (await fetch('/samples/GOPR6541.jpg')).blob();
        const bitmap = await toBitmap(blob);
        const w0 = bitmap.width;
        const h0 = bitmap.height;
        const raw = await client.infer(bitmap, w0, h0);
        if (!alive) return;

        const mine = decode(raw.data, raw.letterbox, expected.params);
        const stats = computeStats(mine);

        const lbOk =
          Math.abs(raw.letterbox.r - expected.letterbox.r) < 1e-6 &&
          raw.letterbox.padLeft === expected.letterbox.padLeft &&
          raw.letterbox.padTop === expected.letterbox.padTop;

        // Greedy nearest-box matching by class, so a small shift in one box
        // doesn't cascade into every subsequent index being "wrong".
        const pool = [...mine];
        const rows: Row[] = [];
        for (let i = 0; i < expected.detections.length; i++) {
          const t = expected.detections[i];
          let best: Detection | null = null;
          let bestD = Infinity;
          for (const m of pool) {
            if (m.classId !== t.classId) continue;
            const d = Math.max(
              Math.abs(m.box.x1 - t.box.x1),
              Math.abs(m.box.y1 - t.box.y1),
              Math.abs(m.box.x2 - t.box.x2),
              Math.abs(m.box.y2 - t.box.y2),
            );
            if (d < bestD) { bestD = d; best = m; }
          }
          if (best) pool.splice(pool.indexOf(best), 1);
          const dScore = best ? Math.abs(best.score - t.score) : Infinity;
          rows.push({
            i,
            ok: Boolean(best) && bestD <= BOX_TOL_PX && dScore <= SCORE_TOL,
            cls: t.classId === 0 ? 'Occupied' : 'Open',
            score: [t.score, best?.score ?? NaN],
            dBox: bestD,
            dScore,
          });
        }

        const countsOk =
          stats.total === expected.counts.total &&
          stats.occupied === expected.counts.occupied &&
          stats.open === expected.counts.open;

        setReport({
          ep: raw.ep,
          inferenceMs: raw.inferenceMs,
          letterbox: { mine: raw.letterbox, theirs: expected.letterbox, ok: lbOk },
          counts: {
            mine: { total: stats.total, occupied: stats.occupied, open: stats.open },
            theirs: expected.counts,
            ok: countsOk,
          },
          rows,
          unmatched: pool.length,
          pass: lbOk && countsOk && rows.every((r) => r.ok) && pool.length === 0,
        });
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => { alive = false; };
  }, [status, client]);

  if (err) return <p role="alert" style={{ color: 'var(--color-occupied)' }}>{err}</p>;
  if (status === 'error') return <p role="alert" style={{ color: 'var(--color-occupied)' }}>Model failed to load.</p>;
  if (!report) return <p style={{ color: 'var(--text-muted)' }}>Running… ({status}{ep ? `, ${ep}` : ''})</p>;

  const fails = report.rows.filter((r) => !r.ok).length;

  return (
    <div className="space-y-5" data-testid="parity-report" data-pass={String(report.pass)}>
      <div
        className="rounded-xl border p-5"
        style={{
          background: 'var(--bg-raised)',
          borderColor: report.pass ? 'var(--color-open)' : 'var(--color-occupied)',
        }}
      >
        <p className="text-lg font-semibold">
          {report.pass ? 'PASS' : 'FAIL'}
          <span className="ml-3 text-sm font-normal tnum" style={{ color: 'var(--text-muted)' }}>
            {report.ep} · {report.inferenceMs.toFixed(0)}ms
          </span>
        </p>
        <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          <Line ok={report.letterbox.ok} label="Letterbox">
            r={report.letterbox.mine.r.toFixed(4)} pad={report.letterbox.mine.padLeft}/{report.letterbox.mine.padTop}
            {' '}vs r={report.letterbox.theirs.r.toFixed(4)} pad={report.letterbox.theirs.padLeft}/{report.letterbox.theirs.padTop}
          </Line>
          <Line ok={report.counts.ok} label="Counts">
            {report.counts.mine.occupied} occ / {report.counts.mine.open} open
            {' '}vs {report.counts.theirs.occupied} occ / {report.counts.theirs.open} open
          </Line>
          <Line ok={fails === 0} label="Boxes">
            {report.rows.length - fails} / {report.rows.length} within {BOX_TOL_PX}px &amp; {SCORE_TOL}
          </Line>
          <Line ok={report.unmatched === 0} label="Extra detections">
            {report.unmatched}
          </Line>
        </dl>
      </div>

      <div className="overflow-x-auto rounded-xl border" style={{ background: 'var(--bg-raised)' }}>
        <table className="w-full text-xs tnum">
          <thead style={{ color: 'var(--text-muted)' }}>
            <tr className="border-b text-left">
              <th className="px-3 py-2">#</th><th className="px-3 py-2">Class</th>
              <th className="px-3 py-2">Python score</th><th className="px-3 py-2">Browser score</th>
              <th className="px-3 py-2">Δ box (px)</th><th className="px-3 py-2">Δ score</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr
                key={r.i}
                className="border-b last:border-b-0"
                style={{ color: r.ok ? undefined : 'var(--color-occupied)' }}
              >
                <td className="px-3 py-1">{r.i + 1}</td>
                <td className="px-3 py-1">{r.cls}</td>
                <td className="px-3 py-1">{r.score[0].toFixed(4)}</td>
                <td className="px-3 py-1">{Number.isNaN(r.score[1]) ? '—' : r.score[1].toFixed(4)}</td>
                <td className="px-3 py-1">{Number.isFinite(r.dBox) ? r.dBox.toFixed(2) : '—'}</td>
                <td className="px-3 py-1">{Number.isFinite(r.dScore) ? r.dScore.toFixed(4) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Line({ ok, label, children }: { ok: boolean; label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: ok ? 'var(--color-open)' : 'var(--color-occupied)' }} />
        {label}
      </dt>
      <dd className="tnum" style={{ color: 'var(--text-muted)' }}>{children}</dd>
    </>
  );
}
