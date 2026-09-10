/**
 * Decode YOLOv5 raw output -> Detection[] in ORIGINAL image coordinates.
 *
 * ── What the ONNX graph already did for us ────────────────────────────────
 * The Detect layer's decode is BAKED INTO the exported graph: the sigmoid,
 * the grid-offset add, and the stride multiply all happen inside ONNX. So the
 * rows arriving here are already:
 *   - xywh in INPUT-PIXEL space (0..416, post-letterbox), center-anchored
 *   - objectness and class scores already sigmoid'd to [0,1]
 * We need NO anchors, NO strides, NO grids in JS. This is the single most
 * common thing people get wrong when hand-porting YOLOv5 to the browser.
 *
 * ── Row layout, 7 floats ──────────────────────────────────────────────────
 *   [0]=cx [1]=cy [2]=w [3]=h [4]=objectness [5]=P(occupied) [6]=P(open)
 *
 * At 416: (52² + 26² + 13²) × 3 anchors = 3549 × 3 = 10647 rows.
 * Concatenation order is P3→P4→P5, anchor-major then y then x. You don't need
 * that to decode, but it helps when debugging against Python.
 *
 * ── Why this is a pure function ───────────────────────────────────────────
 * The raw Float32Array stays in React state; this runs behind useMemo. Moving
 * a threshold slider re-runs ONLY this (~10k iterations + an NMS over <200
 * survivors, well under 2ms) and never re-runs the model.
 */
import {
  CLASSES,
  type ClassId,
  type Detection,
  type DetectionResult,
  type FilterParams,
  type LetterboxInfo,
  type OccupancyStats,
} from '@/lib/detect/types';

/** Row stride in floats: 4 box + 1 objectness + N classes. */
export const STRIDE = 5 + CLASSES.length; // 7

/** yolov5's `max_nms` — cap candidates fed into the O(n²) suppression loop. */
const MAX_NMS = 30_000;

/**
 * Class-separation offset for NMS, mirroring yolov5's `c = cls * max_wh` trick.
 * Boxes are shifted into disjoint coordinate bands per class so suppression can
 * never cross classes.
 *
 * This MATTERS: with a class-agnostic NMS, an "Occupied" box would suppress an
 * overlapping "Open" box (they often overlap at spot boundaries), silently
 * corrupting every count the site displays. Nothing would throw.
 */
const CLASS_OFFSET = 7680;

/** Axis-aligned IoU. Boxes are [x1,y1,x2,y2]. */
function iou(a: Float64Array, b: Float64Array, ai: number, bi: number): number {
  const ax1 = a[ai], ay1 = a[ai + 1], ax2 = a[ai + 2], ay2 = a[ai + 3];
  const bx1 = b[bi], by1 = b[bi + 1], bx2 = b[bi + 2], by2 = b[bi + 3];

  const ix1 = ax1 > bx1 ? ax1 : bx1;
  const iy1 = ay1 > by1 ? ay1 : by1;
  const ix2 = ax2 < bx2 ? ax2 : bx2;
  const iy2 = ay2 < by2 ? ay2 : by2;

  const iw = ix2 - ix1;
  const ih = iy2 - iy1;
  if (iw <= 0 || ih <= 0) return 0;

  const inter = iw * ih;
  const areaA = (ax2 - ax1) * (ay2 - ay1);
  const areaB = (bx2 - bx1) * (by2 - by1);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Decode raw model output into detections in ORIGINAL image pixel space.
 *
 * @param raw    Float32Array of length rows*STRIDE, straight from the session.
 * @param lb     Letterbox params produced by preprocess(), used to invert the
 *               resize+pad back onto the source image.
 * @param params Confidence / IoU / max-detections thresholds.
 */
export function decode(
  raw: Float32Array,
  lb: LetterboxInfo,
  params: FilterParams,
): Detection[] {
  const { conf, iou: iouThreshold, maxDet } = params;
  const rows = (raw.length / STRIDE) | 0;

  // Parallel arrays rather than objects: this loop runs on every slider tick.
  const boxes = new Float64Array(MAX_NMS * 4); // NMS space (class-offset applied)
  const scores = new Float64Array(MAX_NMS);
  const classes = new Uint8Array(MAX_NMS);
  const objs = new Float64Array(MAX_NMS);
  const probs = new Float64Array(MAX_NMS);
  let n = 0;

  for (let i = 0; i < rows && n < MAX_NMS; i++) {
    const o = i * STRIDE;

    // yolov5 prefilters on objectness BEFORE computing the joint score.
    const objectness = raw[o + 4];
    if (objectness < conf) continue;

    // Best class only (AutoShape runs multi_label=False).
    let classId = 0;
    let best = raw[o + 5];
    for (let c = 1; c < CLASSES.length; c++) {
      const p = raw[o + 5 + c];
      if (p > best) { best = p; classId = c; }
    }

    const score = objectness * best;
    if (score < conf) continue;

    // center xywh -> corner xyxy, still in letterboxed input space
    const cx = raw[o], cy = raw[o + 1], w = raw[o + 2], h = raw[o + 3];
    const hw = w / 2, hh = h / 2;
    const off = classId * CLASS_OFFSET;

    const b = n * 4;
    boxes[b]     = cx - hw + off;
    boxes[b + 1] = cy - hh + off;
    boxes[b + 2] = cx + hw + off;
    boxes[b + 3] = cy + hh + off;
    scores[n] = score;
    classes[n] = classId;
    objs[n] = objectness;
    probs[n] = best;
    n++;
  }

  if (n === 0) return [];

  // Sort candidate indices by score, descending.
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  const idx = Array.from(order).sort((a, b) => scores[b] - scores[a]);

  // Greedy NMS.
  const keep: number[] = [];
  const suppressed = new Uint8Array(n);
  for (let a = 0; a < idx.length && keep.length < maxDet; a++) {
    const i = idx[a];
    if (suppressed[i]) continue;
    keep.push(i);
    for (let b = a + 1; b < idx.length; b++) {
      const j = idx[b];
      if (suppressed[j]) continue;
      if (iou(boxes, boxes, i * 4, j * 4) > iouThreshold) suppressed[j] = 1;
    }
  }

  // Un-letterbox back to original image coordinates.
  const { r, padLeft, padTop, w0, h0 } = lb;
  const out: Detection[] = [];
  for (let k = 0; k < keep.length; k++) {
    const i = keep[k];
    const b = i * 4;
    const off = classes[i] * CLASS_OFFSET;
    out.push({
      id: k,
      classId: classes[i] as ClassId,
      score: scores[i],
      objectness: objs[i],
      classProb: probs[i],
      box: {
        x1: clamp((boxes[b]     - off - padLeft) / r, 0, w0),
        y1: clamp((boxes[b + 1] - off - padTop)  / r, 0, h0),
        x2: clamp((boxes[b + 2] - off - padLeft) / r, 0, w0),
        y2: clamp((boxes[b + 3] - off - padTop)  / r, 0, h0),
      },
    });
  }
  return out;
}

/** Aggregate detections into the numbers the site actually displays. */
export function computeStats(detections: Detection[]): OccupancyStats {
  let occupied = 0;
  let scoreSum = 0;
  for (const d of detections) {
    if (d.classId === 0) occupied++; // index 0 === Occupied (asserted in verify_parity.py)
    scoreSum += d.score;
  }
  const total = detections.length;
  const open = total - occupied;
  return {
    open,
    occupied,
    total,
    // Guard the empty case explicitly: 0/0 would render "NaN% full".
    occupancyRate: total > 0 ? occupied / total : 0,
    meanScore: total > 0 ? scoreSum / total : 0,
  };
}

/** Convenience: decode + aggregate in one call, for useMemo call sites. */
export function decodeAndScore(
  raw: Float32Array,
  lb: LetterboxInfo,
  params: FilterParams,
): DetectionResult {
  const detections = decode(raw, lb, params);
  return { detections, stats: computeStats(detections), params };
}
