/**
 * Decode parity against the Python reference.
 *
 * These fixtures come from tools/export/verify_parity.py, which ran the real
 * ONNX graph and then yolov5's OWN non_max_suppression + scale_boxes. So this
 * asserts our TypeScript decode reproduces Ultralytics' semantics exactly.
 *
 * Loading raw.bin skips preprocessing entirely, which is the point: if this
 * suite passes but the browser disagrees, the bug is in the letterbox, not the
 * decode. That halves the debugging surface.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decode, computeStats, STRIDE } from '@/lib/detect/postprocess';
import type { Detection, LetterboxInfo } from '@/lib/detect/types';

const FIX = join(process.cwd(), 'tools', 'export', 'fixtures');

interface Expected {
  imgsz: number;
  origWidth: number;
  origHeight: number;
  letterbox: LetterboxInfo;
  rawShape: [number, number, number];
  classes: string[];
  params: { conf: number; iou: number; maxDet: number };
  counts: { total: number; occupied: number; open: number };
  detections: {
    classId: number;
    className: string;
    score: number;
    box: { x1: number; y1: number; x2: number; y2: number };
  }[];
}

function loadFixture(stem: string) {
  const expected: Expected = JSON.parse(
    readFileSync(join(FIX, `${stem}.expected.json`), 'utf8'),
  );
  const buf = readFileSync(join(FIX, `${stem}.raw.bin`));
  // Copy through a fresh ArrayBuffer: Node pools Buffers, so byteOffset is
  // rarely 0 and a naive Float32Array view would read the wrong window.
  const raw = new Float32Array(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
  return { expected, raw };
}

describe('decode() vs the Python reference', () => {
  const { expected, raw } = loadFixture('GOPR6541');

  it('fixture has the shape the 416 graph produces', () => {
    // (52² + 26² + 13²) × 3 anchors = 10647 rows, 4 xywh + 1 obj + 2 cls.
    expect(expected.rawShape).toEqual([1, 10647, 7]);
    expect(STRIDE).toBe(7);
    expect(raw.length).toBe(10647 * 7);
  });

  it('class order is Occupied-first — inverting it would flip every statistic', () => {
    expect(expected.classes).toEqual([
      'Occupied-Parking-Spaces',
      'Open-Parking-Spaces',
    ]);
  });

  it('letterbox metadata matches the 640x480 -> 416 case', () => {
    expect(expected.letterbox.r).toBeCloseTo(0.65, 10);
    expect(expected.letterbox.padLeft).toBe(0);
    expect(expected.letterbox.padTop).toBe(52);
  });

  const got = decode(raw, expected.letterbox, expected.params);

  it('produces the same number of detections', () => {
    expect(got.length).toBe(expected.detections.length);
  });

  it('produces the same class counts', () => {
    const stats = computeStats(got);
    expect(stats.occupied).toBe(expected.counts.occupied);
    expect(stats.open).toBe(expected.counts.open);
    expect(stats.total).toBe(expected.counts.total);
  });

  it('matches every box and score', () => {
    const sortKey = (d: { score: number }) => -d.score;
    const mine = [...got].sort((a, b) => sortKey(a) - sortKey(b));
    const theirs = [...expected.detections].sort((a, b) => sortKey(a) - sortKey(b));

    for (let i = 0; i < theirs.length; i++) {
      const a: Detection = mine[i];
      const b = theirs[i];
      expect(a.classId, `detection ${i} class`).toBe(b.classId);
      expect(a.score, `detection ${i} score`).toBeCloseTo(b.score, 4);
      // Python rounds boxes to whole pixels; allow half a pixel.
      expect(Math.abs(a.box.x1 - b.box.x1), `detection ${i} x1`).toBeLessThan(0.5);
      expect(Math.abs(a.box.y1 - b.box.y1), `detection ${i} y1`).toBeLessThan(0.5);
      expect(Math.abs(a.box.x2 - b.box.x2), `detection ${i} x2`).toBeLessThan(0.5);
      expect(Math.abs(a.box.y2 - b.box.y2), `detection ${i} y2`).toBeLessThan(0.5);
    }
  });

  it('keeps every box inside the original image bounds', () => {
    for (const d of got) {
      expect(d.box.x1).toBeGreaterThanOrEqual(0);
      expect(d.box.y1).toBeGreaterThanOrEqual(0);
      expect(d.box.x2).toBeLessThanOrEqual(expected.origWidth);
      expect(d.box.y2).toBeLessThanOrEqual(expected.origHeight);
    }
  });

  it('raising the confidence threshold monotonically reduces detections', () => {
    const lo = decode(raw, expected.letterbox, { ...expected.params, conf: 0.25 });
    const hi = decode(raw, expected.letterbox, { ...expected.params, conf: 0.6 });
    expect(hi.length).toBeLessThanOrEqual(lo.length);
    for (const d of hi) expect(d.score).toBeGreaterThanOrEqual(0.6);
  });
});

describe('NMS class separation', () => {
  /** One row of the model's 7-float layout. */
  function row(cx: number, cy: number, w: number, h: number, obj: number, pOcc: number, pOpen: number) {
    return [cx, cy, w, h, obj, pOcc, pOpen];
  }

  const identity: LetterboxInfo = { r: 1, padLeft: 0, padTop: 0, w0: 416, h0: 416 };

  it('does NOT let an Occupied box suppress a heavily overlapping Open box', () => {
    // Two nearly identical boxes, different classes. A class-agnostic NMS would
    // drop one and silently corrupt the occupancy count.
    const raw = new Float32Array([
      ...row(100, 100, 50, 50, 0.9, 0.95, 0.02),
      ...row(101, 101, 50, 50, 0.9, 0.02, 0.95),
    ]);
    const got = decode(raw, identity, { conf: 0.25, iou: 0.45, maxDet: 300 });
    expect(got.length).toBe(2);
    expect(new Set(got.map((d) => d.classId))).toEqual(new Set([0, 1]));
  });

  it('does suppress a heavily overlapping box of the SAME class', () => {
    const raw = new Float32Array([
      ...row(100, 100, 50, 50, 0.9, 0.95, 0.02),
      ...row(101, 101, 50, 50, 0.8, 0.93, 0.02),
    ]);
    const got = decode(raw, identity, { conf: 0.25, iou: 0.45, maxDet: 300 });
    expect(got.length).toBe(1);
  });

  it('keeps two distant boxes of the same class', () => {
    const raw = new Float32Array([
      ...row(50, 50, 20, 20, 0.9, 0.95, 0.02),
      ...row(300, 300, 20, 20, 0.9, 0.95, 0.02),
    ]);
    expect(decode(raw, identity, { conf: 0.25, iou: 0.45, maxDet: 300 })).toHaveLength(2);
  });
});

describe('computeStats', () => {
  it('reports 0 rather than NaN when nothing was detected', () => {
    const s = computeStats([]);
    expect(s.total).toBe(0);
    expect(s.occupancyRate).toBe(0);
    expect(Number.isNaN(s.occupancyRate)).toBe(false);
    expect(Number.isNaN(s.meanScore)).toBe(false);
  });

  it('counts classId 0 as occupied', () => {
    const mk = (classId: 0 | 1): Detection => ({
      id: 0, classId, score: 0.9, objectness: 0.9, classProb: 1,
      box: { x1: 0, y1: 0, x2: 1, y2: 1 },
    });
    const s = computeStats([mk(0), mk(0), mk(1)]);
    expect(s.occupied).toBe(2);
    expect(s.open).toBe(1);
    expect(s.occupancyRate).toBeCloseTo(2 / 3, 6);
  });
});
