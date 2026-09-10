/**
 * Letterbox an image source into the NCHW float32 tensor the ONNX graph wants.
 *
 * This is a direct port of yolov5's
 *   letterbox(im, (416,416), color=(114,114,114), auto=False, scaleFill=False, scaleup=True)
 * The Python reference lives in tools/export/verify_parity.py::letterbox_square.
 * KEEP THE TWO IN SYNC — a mismatch here produces boxes that look plausible and
 * are quietly wrong, which is the failure mode this whole pipeline guards against.
 *
 * Runs inside the detector worker on an OffscreenCanvas, so it never touches the DOM.
 */
import { INPUT_SIZE, type LetterboxInfo } from '@/lib/detect/types';

export interface PreprocessResult {
  /** Float32Array(1*3*size*size), NCHW, RGB, /255. */
  data: Float32Array;
  dims: readonly [1, 3, number, number];
  letterbox: LetterboxInfo;
}

/** Canvas reused across frames — allocating one per video frame is wasteful. */
let scratch: OffscreenCanvas | null = null;
let scratchCtx: OffscreenCanvasRenderingContext2D | null = null;

function getCanvas(size: number) {
  if (!scratch || scratch.width !== size || scratch.height !== size) {
    scratch = new OffscreenCanvas(size, size);
    scratchCtx = scratch.getContext('2d', {
      willReadFrequently: true,
      alpha: false,
    }) as OffscreenCanvasRenderingContext2D | null;
  }
  if (!scratchCtx) throw new Error('2D context unavailable for preprocessing');
  return { canvas: scratch, ctx: scratchCtx };
}

/**
 * Compute the letterbox geometry for a source of size w0×h0.
 * Exported separately so tests can assert the math without a canvas.
 *
 * For the 640×480 sample frames: r = min(416/480, 416/640) = 0.65,
 * newW = 416, newH = 312, padLeft = 0, padTop = 52.
 */
export function computeLetterbox(w0: number, h0: number, size = INPUT_SIZE): LetterboxInfo & {
  newW: number;
  newH: number;
} {
  // scaleup=true, so r may exceed 1 for images smaller than the input.
  const r = Math.min(size / h0, size / w0);
  const newW = Math.round(w0 * r);
  const newH = Math.round(h0 * r);
  const dw = (size - newW) / 2;
  const dh = (size - newH) / 2;
  // The -0.1 matches yolov5's round(dw - 0.1), which biases the odd pixel to
  // the bottom/right — worth replicating exactly so boxes line up sub-pixel.
  const padLeft = Math.round(dw - 0.1);
  const padTop = Math.round(dh - 0.1);
  return { r, padLeft, padTop, w0, h0, newW, newH };
}

/**
 * @param source Anything drawable: ImageBitmap, HTMLImageElement,
 *               HTMLVideoElement, VideoFrame. The image and video paths share
 *               this function unchanged.
 */
export function preprocess(
  source: CanvasImageSource,
  w0: number,
  h0: number,
  size = INPUT_SIZE,
): PreprocessResult {
  const lb = computeLetterbox(w0, h0, size);
  const { ctx } = getCanvas(size);

  // Fill first: this is both the letterbox padding AND the backdrop that any
  // transparent PNG composites onto, matching cv2's opaque BGR pipeline.
  ctx.fillStyle = 'rgb(114,114,114)';
  ctx.fillRect(0, 0, size, size);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, lb.padLeft, lb.padTop, lb.newW, lb.newH);

  const { data: px } = ctx.getImageData(0, 0, size, size);

  // RGBA interleaved -> planar RGB float32. Canvas is already RGB, so unlike
  // the cv2 path there is no BGR swap to undo.
  const plane = size * size;
  const out = new Float32Array(3 * plane);
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    out[i] = px[p] / 255;
    out[plane + i] = px[p + 1] / 255;
    out[2 * plane + i] = px[p + 2] / 255;
  }

  return {
    data: out,
    dims: [1, 3, size, size] as const,
    letterbox: { r: lb.r, padLeft: lb.padLeft, padTop: lb.padTop, w0, h0 },
  };
}

/**
 * Decode a Blob/File to an ImageBitmap on the main thread, honoring EXIF.
 *
 * `imageOrientation: 'from-image'` is not optional: <img> applies EXIF rotation
 * when displaying, so without it a rotated phone photo would be fed to the model
 * in a different orientation than the one the user is looking at, and every box
 * would land in the wrong place.
 */
export async function toBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}
