/**
 * Shared types for the ParkWise detector.
 *
 * ⚠ CLASS ORDER: index 0 is Occupied, index 1 is Open.
 * Read directly from the checkpoint:
 *   names = ['Occupied-Parking-Spaces', 'Open-Parking-Spaces']
 * Inverting this silently inverts every statistic on the site and nothing
 * throws — so tools/export/verify_parity.py hard-asserts it on every export.
 */
export const CLASSES = ['Occupied', 'Open'] as const;
export type ClassName = (typeof CLASSES)[number];
export type ClassId = 0 | 1;

export const CLASS_OCCUPIED: ClassId = 0;
export const CLASS_OPEN: ClassId = 1;

/** Model input resolution. Must match the exported graph. */
export const INPUT_SIZE = 416;

/** Letterbox fill, matching yolov5's default. */
export const PAD_COLOR = 'rgb(114,114,114)';

/** Bounding box in ORIGINAL image pixel coordinates (not letterboxed space). */
export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Detection {
  /** Stable index within a single decode pass; used for hover linking. */
  id: number;
  classId: ClassId;
  /** objectness * classProb — what thresholds are applied to. */
  score: number;
  objectness: number;
  classProb: number;
  box: Box;
}

/**
 * Everything needed to invert the resize+pad back onto the source image.
 * Produced by preprocess(), consumed by decode().
 */
export interface LetterboxInfo {
  /** Scale factor applied to the source image. May exceed 1 (scaleup=true). */
  r: number;
  padLeft: number;
  padTop: number;
  /** Original source dimensions. */
  w0: number;
  h0: number;
}

export type ExecutionProvider = 'webgpu' | 'wasm';

/**
 * Raw model output, kept in state so threshold changes never re-run the model.
 * `data` is Float32Array(rows * stride).
 */
export interface RawInference {
  data: Float32Array;
  rows: number;
  stride: number;
  letterbox: LetterboxInfo;
  inferenceMs: number;
  ep: ExecutionProvider;
}

export interface FilterParams {
  conf: number;
  iou: number;
  maxDet: number;
}

/** Matches AutoShape's defaults, so our numbers line up with the Python reference. */
export const DEFAULT_PARAMS: FilterParams = { conf: 0.25, iou: 0.45, maxDet: 300 };

export interface OccupancyStats {
  open: number;
  occupied: number;
  total: number;
  /** occupied / total, or 0 when nothing was detected (never NaN). */
  occupancyRate: number;
  meanScore: number;
}

export interface DetectionResult {
  detections: Detection[];
  stats: OccupancyStats;
  params: FilterParams;
}

/** One analyzed video frame. See the memory note in useVideoDetection. */
export interface FrameSample {
  index: number;
  /** Seconds into the clip. */
  time: number;
  /**
   * Survivors of an objectness prefilter at VIDEO_CONF_FLOOR, packed 7 floats
   * each — NOT the full 10647-row output, which would be ~298KB per frame and
   * would OOM mobile Safari across a few hundred frames.
   *
   * These are PRE-NMS on purpose: it keeps BOTH sliders live, since IoU cannot
   * be re-applied to an already-suppressed list.
   */
  rows: Float32Array;
  letterbox: LetterboxInfo;
}

/**
 * Objectness floor for cached video rows. The confidence slider cannot go below
 * this in video mode — surfaced in the UI rather than silently clamped.
 */
export const VIDEO_CONF_FLOOR = 0.1;
