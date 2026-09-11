'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDetector } from './useDetector';
import { decode, computeStats } from '@/lib/detect/postprocess';
import {
  DEFAULT_PARAMS,
  VIDEO_CONF_FLOOR,
  type FilterParams,
  type FrameSample,
  type OccupancyStats,
} from '@/lib/detect/types';

export type Density = 'auto' | 'fast' | 'balanced' | 'detailed';

export interface FramePoint {
  index: number;
  time: number;
  stats: OccupancyStats;
}

export interface VideoAnalysis {
  points: FramePoint[];
  peak: FramePoint | null;
  trough: FramePoint | null;
  meanRate: number;
}

interface Progress {
  done: number;
  total: number;
  perFrameMs: number;
}

/** "Analysis should finish in about this long." Drives the frame budget. */
const BUDGET_MS = 20_000;
const MIN_FRAMES = 30;
const MAX_FRAMES = 300;

const DENSITY_FPS: Record<Exclude<Density, 'auto'>, number> = {
  fast: 1,
  balanced: 2,
  detailed: 4,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function once(el: HTMLMediaElement, ev: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error(mediaErrorMessage(el.error))); };
    const cleanup = () => {
      el.removeEventListener(ev, ok);
      el.removeEventListener('error', bad);
    };
    el.addEventListener(ev, ok, { once: true });
    el.addEventListener('error', bad, { once: true });
  });
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function mediaErrorMessage(err: MediaError | null): string {
  if (!err) return 'The video could not be decoded.';
  switch (err.code) {
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
    case MediaError.MEDIA_ERR_DECODE:
      // This is the case that actually happens: HEVC .mov straight off an
      // iPhone, which Chrome will not decode. Say so instead of failing silently.
      return 'This browser cannot decode that video. iPhone .mov files are usually HEVC, which Chrome does not support — try exporting as H.264 MP4 or WebM.';
    case MediaError.MEDIA_ERR_NETWORK:
      return 'The video stopped loading.';
    default:
      return 'The video could not be played.';
  }
}

export function useVideoDetection(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const { client, status } = useDetector();

  const [params, setParamsRaw] = useState<FilterParams>(DEFAULT_PARAMS);
  const [density, setDensity] = useState<Density>('auto');
  const [samples, setSamples] = useState<Map<number, FrameSample>>(new Map());
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  const abortRef = useRef(false);
  const runRef = useRef(0);

  /** Confidence can never drop below the cache floor in video mode. */
  const setParams = useCallback((p: FilterParams) => {
    setParamsRaw({ ...p, conf: Math.max(VIDEO_CONF_FLOOR, p.conf) });
  }, []);

  const reset = useCallback(() => {
    abortRef.current = true;
    client?.abort();
    runRef.current++;
    setSamples(new Map());
    setProgress(null);
    setRunning(false);
    setError(null);
    setDuration(0);
    setDims(null);
  }, [client]);

  const analyze = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !client || status !== 'ready') return;

    const run = ++runRef.current;
    abortRef.current = false;
    setRunning(true);
    setError(null);
    setSamples(new Map());

    try {
      if (video.readyState < 1) await once(video, 'loadedmetadata');
      const d = video.duration;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!Number.isFinite(d) || d <= 0 || !w || !h) {
        throw new Error(mediaErrorMessage(video.error));
      }
      setDuration(d);
      setDims({ w, h });

      const wasPlaying = !video.paused;
      video.pause();

      const grab = async (t: number): Promise<ImageBitmap> => {
        // Assigning currentTime is frame-accurate; fastSeek() snaps to
        // keyframes, so it is deliberately not used here.
        video.currentTime = t;
        await once(video, 'seeked');
        // Without yielding a frame, createImageBitmap can capture the
        // previous (or a black) frame on some browsers.
        await nextFrame();
        return createImageBitmap(video);
      };

      // ── Measure, then budget ─────────────────────────────────────────────
      // WASM and WebGPU differ by ~6x, so a fixed fps is wrong for one of them.
      // Run the first frame, time it, and size the walk to the budget.
      const first = await client.inferFrame(await grab(0), w, h, 0, 0);
      if (run !== runRef.current || abortRef.current) return;

      const perFrameMs = Math.max(1, first.inferenceMs);
      let total: number;
      if (density === 'auto') {
        total = clamp(Math.floor(BUDGET_MS / perFrameMs), MIN_FRAMES, MAX_FRAMES);
        total = Math.min(total, Math.ceil(d * 4)); // never denser than 4 fps
      } else {
        total = clamp(Math.ceil(d * DENSITY_FPS[density]), 2, MAX_FRAMES);
      }
      total = Math.max(2, total);

      const times = Array.from({ length: total }, (_, i) =>
        // Keep the last sample a hair before the end so the seek resolves.
        Math.min(d - 0.05, (i / (total - 1)) * d),
      );

      const acc = new Map<number, FrameSample>();
      acc.set(0, { index: 0, time: 0, rows: first.rows, letterbox: first.letterbox });
      setSamples(new Map(acc));
      setProgress({ done: 1, total, perFrameMs });

      for (let i = 1; i < total; i++) {
        if (run !== runRef.current || abortRef.current) break;
        const t = times[i];
        const res = await client.inferFrame(await grab(t), w, h, i, t);
        if (run !== runRef.current || abortRef.current) break;
        acc.set(i, { index: i, time: t, rows: res.rows, letterbox: res.letterbox });
        // Batch state updates: every frame would be 300 re-renders of a chart.
        if (i % 3 === 0 || i === total - 1) setSamples(new Map(acc));
        setProgress({ done: i + 1, total, perFrameMs });
      }

      video.currentTime = 0;
      if (wasPlaying) void video.play();
    } catch (e) {
      if (run === runRef.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (run === runRef.current) setRunning(false);
    }
  }, [client, status, density, videoRef]);

  const cancel = useCallback(() => {
    abortRef.current = true;
    client?.abort();
    setRunning(false);
  }, [client]);

  // Re-abort on unmount so a long walk doesn't keep the worker busy.
  useEffect(() => () => { abortRef.current = true; client?.abort(); }, [client]);

  /**
   * Re-decoding every cached frame on a slider change is ~300 × (a few
   * hundred rows + NMS) ≈ tens of ms. Cheap enough to be synchronous.
   */
  const analysis = useMemo<VideoAnalysis>(() => {
    const points: FramePoint[] = [];
    for (const s of [...samples.values()].sort((a, b) => a.index - b.index)) {
      const dets = decode(s.rows, s.letterbox, params);
      points.push({ index: s.index, time: s.time, stats: computeStats(dets) });
    }
    let peak: FramePoint | null = null;
    let trough: FramePoint | null = null;
    let sum = 0;
    let n = 0;
    for (const p of points) {
      if (p.stats.total === 0) continue;
      n++;
      sum += p.stats.occupancyRate;
      if (!peak || p.stats.occupancyRate > peak.stats.occupancyRate) peak = p;
      if (!trough || p.stats.occupancyRate < trough.stats.occupancyRate) trough = p;
    }
    return { points, peak, trough, meanRate: n ? sum / n : 0 };
  }, [samples, params]);

  /** Nearest analyzed sample to a playback time, for the live overlay. */
  const sampleAt = useCallback(
    (t: number): FrameSample | null => {
      let best: FrameSample | null = null;
      let bestD = Infinity;
      for (const s of samples.values()) {
        const dd = Math.abs(s.time - t);
        if (dd < bestD) { bestD = dd; best = s; }
      }
      return best;
    },
    [samples],
  );

  return {
    status,
    params,
    setParams,
    density,
    setDensity,
    analyze,
    cancel,
    reset,
    running,
    progress,
    error,
    duration,
    dims,
    samples,
    analysis,
    sampleAt,
  };
}
