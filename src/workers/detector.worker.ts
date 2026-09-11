/// <reference lib="webworker" />
/**
 * The ONLY module in the app that loads onnxruntime-web.
 *
 * Keeping ORT confined to a worker solves several problems at once:
 *   - it never enters the server bundle, so no SSR crash, no `window is not
 *     defined`, and no dynamic({ssr:false}) gymnastics around the import;
 *   - inference and per-frame decoding run off the main thread, which is what
 *     keeps the video page responsive while it walks hundreds of frames;
 *   - the session is a module-level singleton here, so navigating between
 *     /detect and /detect/video reuses it and never re-downloads the model.
 *
 * ORT is imported AT RUNTIME from /ort/, not bundled. It spawns its own
 * internal threads with `new Worker(import.meta.url)`; if webpack bundled it,
 * import.meta.url would be rewritten to a file:// path and Chrome would refuse
 * the worker as cross-origin. Loaded from /ort/ it resolves same-origin.
 * scripts/copy-ort-assets.mjs puts the bundle there.
 */
import type * as OrtTypes from 'onnxruntime-web';
import { preprocess } from '@/lib/detect/preprocess';
import {
  INPUT_SIZE,
  VIDEO_CONF_FLOOR,
  type ExecutionProvider,
  type LetterboxInfo,
} from '@/lib/detect/types';

const STRIDE = 7;

type Ort = typeof OrtTypes;
let ortPromise: Promise<Ort> | null = null;

function loadOrt(): Promise<Ort> {
  if (!ortPromise) {
    ortPromise = (
      // @ts-expect-error — runtime URL, not a module path; resolved by the browser
      import(/* webpackIgnore: true */ '/ort/ort.webgpu.bundle.min.mjs') as Promise<Ort>
    ).then((ort) => {
      // Served from public/ort/, populated by scripts/copy-ort-assets.mjs.
      // Deliberately not a CDN: version skew, offline dev, and it fights COEP.
      ort.env.wasm.wasmPaths = '/ort/';
      ort.env.wasm.simd = true;
      // Threads need SharedArrayBuffer, which needs cross-origin isolation.
      // Safari has no `credentialless` COEP, so it lands here single-threaded.
      // Threads are an optimization, never a requirement.
      ort.env.wasm.numThreads = globalThis.crossOriginIsolated
        ? Math.min(4, navigator.hardwareConcurrency || 4)
        : 1;
      return ort;
    });
  }
  return ortPromise;
}

let sessionPromise: Promise<{ session: OrtTypes.InferenceSession; ep: ExecutionProvider }> | null = null;
let modelUrl = '';

async function build(url: string) {
  const ort = await loadOrt();
  const preferWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;

  if (preferWebGPU) {
    try {
      const session = await ort.InferenceSession.create(url, {
        executionProviders: ['webgpu'],
        graphOptimizationLevel: 'all',
      });
      return { session, ep: 'webgpu' as const };
    } catch (err) {
      // Driver blocklists, older Chrome, and most Linux configs land here.
      // Fall through to WASM rather than failing the page.
      console.warn('[detector] WebGPU unavailable, falling back to wasm:', err);
    }
  }

  const session = await ort.InferenceSession.create(url, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  return { session, ep: 'wasm' as const };
}

function getSession(url: string) {
  if (!sessionPromise || modelUrl !== url) {
    modelUrl = url;
    sessionPromise = build(url);
  }
  return sessionPromise;
}

async function infer(bitmap: ImageBitmap, w0: number, h0: number) {
  const { session, ep } = await getSession(modelUrl);
  const { data, dims, letterbox } = preprocess(bitmap, w0, h0, INPUT_SIZE);
  bitmap.close();

  const ort = await loadOrt();
  const feeds: Record<string, OrtTypes.Tensor> = {
    [session.inputNames[0]]: new ort.Tensor('float32', data, dims as unknown as number[]),
  };

  const t0 = performance.now();
  // Read the output name off the session rather than hardcoding "output0" —
  // it varies between exporter versions.
  const results = await session.run(feeds);
  const inferenceMs = performance.now() - t0;

  const out = results[session.outputNames[0]];
  return { raw: out.data as Float32Array, letterbox, inferenceMs, ep };
}

/**
 * Keep only rows above the objectness floor, packed tight.
 *
 * Caching full raw output per video frame would be 10647*7*4 = 298KB/frame;
 * a few hundred frames would OOM mobile Safari. These survivors are ~10KB/frame.
 * They stay PRE-NMS so both sliders remain live — IoU cannot be re-applied to
 * an already-suppressed list.
 */
function packSurvivors(raw: Float32Array, floor = VIDEO_CONF_FLOOR): Float32Array {
  const rows = (raw.length / STRIDE) | 0;
  const keep: number[] = [];
  for (let i = 0; i < rows; i++) {
    if (raw[i * STRIDE + 4] >= floor) keep.push(i);
  }
  const packed = new Float32Array(keep.length * STRIDE);
  for (let k = 0; k < keep.length; k++) {
    packed.set(raw.subarray(keep[k] * STRIDE, keep[k] * STRIDE + STRIDE), k * STRIDE);
  }
  return packed;
}

type InMsg =
  | { type: 'init'; url: string }
  | { type: 'infer'; id: number; bitmap: ImageBitmap; w0: number; h0: number }
  | { type: 'inferFrame'; id: number; index: number; time: number; bitmap: ImageBitmap; w0: number; h0: number }
  | { type: 'abort' };

let aborted = false;

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      modelUrl = msg.url;
      const { ep } = await getSession(msg.url);
      self.postMessage({ type: 'ready', ep });
      return;
    }

    if (msg.type === 'abort') {
      aborted = true;
      return;
    }

    if (msg.type === 'infer') {
      aborted = false;
      const { raw, letterbox, inferenceMs, ep } = await infer(msg.bitmap, msg.w0, msg.h0);
      const copy = new Float32Array(raw); // detach from ORT's internal buffer
      self.postMessage(
        {
          type: 'result',
          id: msg.id,
          raw: copy,
          rows: (copy.length / STRIDE) | 0,
          stride: STRIDE,
          letterbox,
          inferenceMs,
          ep,
        },
        [copy.buffer],
      );
      return;
    }

    if (msg.type === 'inferFrame') {
      if (aborted) {
        msg.bitmap.close();
        return;
      }
      const { raw, letterbox, inferenceMs } = await infer(msg.bitmap, msg.w0, msg.h0);
      const packed = packSurvivors(raw);
      self.postMessage(
        {
          type: 'frame',
          id: msg.id,
          index: msg.index,
          time: msg.time,
          rows: packed,
          letterbox,
          inferenceMs,
        },
        [packed.buffer],
      );
      return;
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      id: 'id' in msg ? msg.id : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

export type { InMsg, LetterboxInfo };
