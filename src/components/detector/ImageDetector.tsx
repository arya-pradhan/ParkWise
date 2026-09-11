'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDetector } from '@/lib/hooks/useDetector';
import { decodeAndScore } from '@/lib/detect/postprocess';
import { toBitmap } from '@/lib/detect/preprocess';
import {
  DEFAULT_PARAMS,
  type FilterParams,
  type RawInference,
} from '@/lib/detect/types';
import { DetectionCanvas } from './DetectionCanvas';
import { DetectionList } from './DetectionList';
import { Dropzone } from './Dropzone';
import { ModelStatus } from './ModelStatus';
import { OccupancyStats } from './OccupancyStats';
import { SampleGallery, type Sample } from './SampleGallery';
import { ThresholdControls } from './ThresholdControls';

interface Loaded {
  url: string;
  width: number;
  height: number;
  sampleId: string | null;
  /** True for uploads, whose object URL must be revoked. */
  objectUrl: boolean;
}

export function ImageDetector() {
  const { client, status } = useDetector();

  const [image, setImage] = useState<Loaded | null>(null);
  const [raw, setRaw] = useState<RawInference | null>(null);
  const [params, setParams] = useState<FilterParams>(DEFAULT_PARAMS);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow earlier request landing after a newer one.
  const runId = useRef(0);
  const prevUrl = useRef<string | null>(null);

  /**
   * The reason the raw tensor lives in state: this recomputes on every slider
   * change in well under 2ms, and the model never runs again.
   */
  const result = useMemo(
    () => (raw ? decodeAndScore(raw.data, raw.letterbox, params) : null),
    [raw, params],
  );

  const analyze = useCallback(
    async (src: Blob | string, sampleId: string | null, isUpload: boolean) => {
      if (!client) return;
      const id = ++runId.current;
      setBusy(true);
      setError(null);
      setHoveredId(null);

      try {
        const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
        const url = typeof src === 'string' ? src : URL.createObjectURL(blob);

        const bitmap = await toBitmap(blob);
        // Trust the decoded bitmap over any declared size: EXIF rotation means
        // the manifest's width/height can be transposed relative to what the
        // browser actually renders.
        const w = bitmap.width;
        const h = bitmap.height;

        if (id !== runId.current) {
          bitmap.close();
          if (isUpload) URL.revokeObjectURL(url);
          return;
        }

        if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
        prevUrl.current = isUpload ? url : null;

        setImage({ url, width: w, height: h, sampleId, objectUrl: isUpload });
        setRaw(null);

        const out = await client.infer(bitmap, w, h);
        if (id !== runId.current) return;
        setRaw(out);
      } catch (e) {
        if (id === runId.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (id === runId.current) setBusy(false);
      }
    },
    [client],
  );

  const pickSample = useCallback(
    (s: Sample) => {
      void analyze(s.file, s.id, false);
    },
    [analyze],
  );

  const pickFile = useCallback(
    (f: File) => {
      void analyze(f, null, true);
    },
    [analyze],
  );

  // Auto-load a sample once the model is ready, so the page opens showing the
  // thing working rather than an empty dropzone.
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (status !== 'ready' || bootstrapped.current) return;
    bootstrapped.current = true;
    fetch('/samples/manifest.json')
      .then((r) => r.json())
      .then((all: Sample[]) => {
        const first = all.find((s) => s.id === 'example-full') ?? all[0];
        if (first) pickSample(first);
      })
      .catch(() => {});
  }, [status, pickSample]);

  useEffect(
    () => () => {
      if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    },
    [],
  );

  const disabled = status !== 'ready' || busy;

  return (
    <div className="space-y-6">
      <ModelStatus inferenceMs={raw?.inferenceMs ?? null} />

      {error && (
        <p
          role="alert"
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--color-occupied)', color: 'var(--color-occupied)' }}
        >
          {error}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {image ? (
            <div className="relative">
              <DetectionCanvas
                src={image.url}
                width={image.width}
                height={image.height}
                detections={result?.detections ?? []}
                hoveredId={hoveredId}
                onHover={setHoveredId}
              />
              {busy && (
                <div
                  className="absolute inset-0 grid place-items-center rounded-xl"
                  style={{ background: 'color-mix(in oklch, var(--bg) 55%, transparent)' }}
                >
                  <span
                    className="rounded-full border px-3 py-1.5 text-xs"
                    style={{ background: 'var(--bg-raised)' }}
                  >
                    Detecting…
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div
              className="grid aspect-[4/3] place-items-center rounded-xl border"
              style={{ background: 'var(--bg-sunken)', color: 'var(--text-faint)' }}
            >
              <p className="text-sm">
                {status === 'ready' ? 'Choose an image to begin' : 'Loading the detector…'}
              </p>
            </div>
          )}

          <Dropzone onFile={pickFile} disabled={disabled} />
          <SampleGallery
            selectedId={image?.sampleId ?? null}
            onPick={pickSample}
            disabled={disabled}
          />
        </div>

        <aside className="min-w-0 space-y-5">
          {result && <OccupancyStats stats={result.stats} />}
          <ThresholdControls params={params} onChange={setParams} disabled={!raw} />
          {result && (
            <DetectionList
              detections={result.detections}
              hoveredId={hoveredId}
              onHover={setHoveredId}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
