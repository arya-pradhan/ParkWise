/**
 * Typed wrapper around the detector worker.
 *
 * Owns the request/response correlation so callers get promises instead of
 * message plumbing. One instance per page session — see DetectorProvider.
 */
import type { ExecutionProvider, LetterboxInfo, RawInference } from './types';

export interface FrameResult {
  index: number;
  time: number;
  rows: Float32Array;
  letterbox: LetterboxInfo;
  inferenceMs: number;
}

type Pending = {
  resolve: (v: never) => void;
  reject: (e: Error) => void;
};

export class DetectorClient {
  private worker: Worker;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private readyPromise: Promise<ExecutionProvider>;

  constructor(modelUrl: string) {
    this.worker = new Worker(
      new URL('../../workers/detector.worker.ts', import.meta.url),
      { type: 'module' },
    );

    this.readyPromise = new Promise<ExecutionProvider>((resolve, reject) => {
      const onReady = (e: MessageEvent) => {
        if (e.data?.type === 'ready') {
          this.worker.removeEventListener('message', onReady);
          resolve(e.data.ep as ExecutionProvider);
        } else if (e.data?.type === 'error' && e.data.id === undefined) {
          this.worker.removeEventListener('message', onReady);
          reject(new Error(e.data.message));
        }
      };
      this.worker.addEventListener('message', onReady);
      // A worker that fails to load at all (bad bundle, blocked script) never
      // sends a message — surface that instead of hanging forever.
      this.worker.addEventListener('error', (e) =>
        reject(new Error(e.message || 'detector worker failed to load')),
      );
    });

    this.worker.addEventListener('message', (e: MessageEvent) => {
      const { type, id } = e.data ?? {};
      if (id === undefined) return;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);

      if (type === 'error') {
        p.reject(new Error(e.data.message));
      } else if (type === 'result') {
        p.resolve({
          data: e.data.raw,
          rows: e.data.rows,
          stride: e.data.stride,
          letterbox: e.data.letterbox,
          inferenceMs: e.data.inferenceMs,
          ep: e.data.ep,
        } as never);
      } else if (type === 'frame') {
        p.resolve({
          index: e.data.index,
          time: e.data.time,
          rows: e.data.rows,
          letterbox: e.data.letterbox,
          inferenceMs: e.data.inferenceMs,
        } as never);
      }
    });

    this.worker.postMessage({ type: 'init', url: modelUrl });
  }

  ready(): Promise<ExecutionProvider> {
    return this.readyPromise;
  }

  /** Run one image. The bitmap is transferred and closed by the worker. */
  infer(bitmap: ImageBitmap, w0: number, h0: number): Promise<RawInference> {
    const id = this.nextId++;
    return new Promise<RawInference>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as never, reject });
      this.worker.postMessage({ type: 'infer', id, bitmap, w0, h0 }, [bitmap]);
    });
  }

  /** Run one video frame; returns only rows above the objectness floor. */
  inferFrame(
    bitmap: ImageBitmap,
    w0: number,
    h0: number,
    index: number,
    time: number,
  ): Promise<FrameResult> {
    const id = this.nextId++;
    return new Promise<FrameResult>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as never, reject });
      this.worker.postMessage(
        { type: 'inferFrame', id, index, time, bitmap, w0, h0 },
        [bitmap],
      );
    });
  }

  abort() {
    this.worker.postMessage({ type: 'abort' });
  }

  destroy() {
    for (const p of this.pending.values()) {
      p.reject(new Error('detector destroyed'));
    }
    this.pending.clear();
    this.worker.terminate();
  }
}
