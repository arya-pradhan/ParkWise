'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decode, computeStats } from '@/lib/detect/postprocess';
import { VIDEO_CONF_FLOOR } from '@/lib/detect/types';
import { useVideoDetection, type Density } from '@/lib/hooks/useVideoDetection';
import { ModelStatus } from '@/components/detector/ModelStatus';
import { OccupancyStats } from '@/components/detector/OccupancyStats';
import { ThresholdControls } from '@/components/detector/ThresholdControls';
import { VideoTimeline } from './VideoTimeline';

const ACCEPT = ['video/mp4', 'video/webm', 'video/quicktime'];
const MAX_BYTES = 100 * 1024 * 1024;

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoDetector() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);

  const [src, setSrc] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [over, setOver] = useState(false);

  const v = useVideoDetection(videoRef);

  const pickFile = useCallback(
    (f: File | undefined) => {
      if (!f) return;
      if (!ACCEPT.includes(f.type) && !/\.(mp4|webm|mov)$/i.test(f.name)) {
        setFileErr('Use an MP4, WebM or MOV file.');
        return;
      }
      if (f.size > MAX_BYTES) {
        setFileErr('That video is over 100MB. Trim or compress it first.');
        return;
      }
      setFileErr(null);
      v.reset();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      const url = URL.createObjectURL(f);
      objectUrl.current = url;
      setSrc(url);
      setFileName(f.name);
      setCurrentTime(0);
    },
    [v],
  );

  useEffect(
    () => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); },
    [],
  );

  // Once the file loads, start analysis automatically.
  const autoStarted = useRef<string | null>(null);
  useEffect(() => {
    if (!src || v.status !== 'ready' || autoStarted.current === src) return;
    const video = videoRef.current;
    if (!video) return;
    autoStarted.current = src;
    const go = () => { void v.analyze(); };
    if (video.readyState >= 1) go();
    else video.addEventListener('loadedmetadata', go, { once: true });
  }, [src, v]);

  // Pause the walk if the tab is hidden: seeks and rAF are throttled there and
  // the analysis would crawl. Resuming is the user's call.
  useEffect(() => {
    const onVis = () => { if (document.hidden && v.running) v.cancel(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [v]);

  // ── Playback → playhead, and the live overlay ────────────────────────────
  const current = useMemo(() => {
    const s = v.sampleAt(currentTime);
    if (!s) return null;
    const dets = decode(s.rows, s.letterbox, v.params);
    return { sample: s, dets, stats: computeStats(dets) };
  }, [currentTime, v.sampleAt, v.params]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let raf = 0;
    const tick = () => {
      setCurrentTime(video.currentTime);
      raf = requestAnimationFrame(tick);
    };
    const onPlay = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); };
    const onPause = () => { cancelAnimationFrame(raf); setCurrentTime(video.currentTime); };
    const onSeeked = () => setCurrentTime(video.currentTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('ended', onPause);
    return () => {
      cancelAnimationFrame(raf);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('ended', onPause);
    };
  }, [src]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !v.dims) return;
    if (cv.width !== v.dims.w || cv.height !== v.dims.h) {
      cv.width = v.dims.w;
      cv.height = v.dims.h;
    }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!current) return;
    const k = Math.max(1, Math.min(cv.width, cv.height) / 480);
    for (const d of current.dets) {
      const open = d.classId === 1;
      ctx.strokeStyle = open ? 'rgb(52, 199, 123)' : 'rgb(244, 77, 92)';
      ctx.lineWidth = 1.75 * k;
      ctx.setLineDash(open ? [] : [6 * k, 3 * k]);
      ctx.strokeRect(d.box.x1, d.box.y1, d.box.x2 - d.box.x1, d.box.y2 - d.box.y1);
    }
  }, [current, v.dims]);

  const seek = useCallback((t: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = t;
    setCurrentTime(t);
  }, []);

  const disabled = v.status !== 'ready';

  return (
    <div className="space-y-6">
      <ModelStatus inferenceMs={v.progress?.perFrameMs ?? null} />

      {(v.error || fileErr) && (
        <p role="alert" className="rounded-lg border px-4 py-3 text-sm"
           style={{ borderColor: 'var(--color-occupied)', color: 'var(--color-occupied)' }}>
          {fileErr ?? v.error}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {src ? (
            <div className="relative overflow-hidden rounded-xl border" style={{ background: 'black' }}>
              <video
                ref={videoRef}
                src={src}
                controls
                muted
                playsInline
                preload="auto"
                className="block h-auto w-full"
              />
              <canvas
                ref={canvasRef}
                className="pointer-events-none absolute inset-0 h-full w-full"
                // Leave the native controls reachable at the bottom.
                style={{ height: 'calc(100% - 0px)' }}
              />
              {v.running && v.progress && (
                <div className="absolute inset-x-0 top-0 p-3">
                  <div className="flex items-center gap-3 rounded-lg border px-3 py-2 text-xs backdrop-blur"
                       style={{ background: 'color-mix(in oklch, var(--bg-raised) 88%, transparent)' }}>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--bg-sunken)' }}>
                      <div className="h-full transition-[width] duration-150"
                           style={{ width: `${(v.progress.done / v.progress.total) * 100}%`, background: 'var(--accent)' }} />
                    </div>
                    <span className="tnum whitespace-nowrap">
                      {v.progress.done} / {v.progress.total} ·{' '}
                      ~{Math.max(0, Math.round(((v.progress.total - v.progress.done) * v.progress.perFrameMs * 1.4) / 1000))}s left
                    </span>
                    <button type="button" onClick={v.cancel} className="font-medium underline underline-offset-2">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) pickFile(e.dataTransfer.files?.[0]); }}
              onClick={() => !disabled && inputRef.current?.click()}
              className="grid aspect-video cursor-pointer place-items-center rounded-xl border border-dashed text-center transition-colors"
              style={{
                background: over ? 'var(--color-open-soft)' : 'var(--bg-raised)',
                borderColor: over ? 'var(--color-open)' : 'var(--border-strong)',
                opacity: disabled ? 0.55 : 1,
              }}
            >
              <div className="px-6">
                <p className="text-sm font-medium">
                  {disabled ? 'Loading the detector…' : 'Drop a video, or click to choose'}
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-faint)' }}>
                  MP4, WebM or MOV · up to 100MB · analyzed on your device
                </p>
              </div>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT.join(',') + ',.mov,.mp4,.webm'}
            className="sr-only"
            onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }}
          />

          {src && (
            <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="truncate">{fileName}</span>
              {v.duration > 0 && <span className="tnum">· {fmt(v.duration)}</span>}
              {v.dims && <span className="tnum">· {v.dims.w}×{v.dims.h}</span>}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="ml-auto font-medium underline underline-offset-2"
                style={{ color: 'var(--text)' }}
              >
                Choose another
              </button>
            </div>
          )}

          <VideoTimeline
            analysis={v.analysis}
            duration={v.duration}
            currentTime={currentTime}
            onSeek={seek}
            pending={v.running}
          />
        </div>

        <aside className="min-w-0 space-y-5">
          {current && <OccupancyStats stats={current.stats} />}

          {v.analysis.points.length > 1 && (
            <div className="rounded-xl border p-5 text-sm" style={{ background: 'var(--bg-raised)' }}>
              <h3 className="mb-3 text-sm font-semibold">Across the clip</h3>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 tnum">
                <dt style={{ color: 'var(--text-faint)' }}>Mean</dt>
                <dd>{Math.round(v.analysis.meanRate * 100)}% full</dd>
                {v.analysis.peak && (
                  <>
                    <dt style={{ color: 'var(--text-faint)' }}>Busiest</dt>
                    <dd>
                      <button type="button" onClick={() => seek(v.analysis.peak!.time)} className="underline underline-offset-2">
                        {Math.round(v.analysis.peak.stats.occupancyRate * 100)}% at {fmt(v.analysis.peak.time)}
                      </button>
                    </dd>
                  </>
                )}
                {v.analysis.trough && (
                  <>
                    <dt style={{ color: 'var(--text-faint)' }}>Emptiest</dt>
                    <dd>
                      <button type="button" onClick={() => seek(v.analysis.trough!.time)} className="underline underline-offset-2">
                        {Math.round(v.analysis.trough.stats.occupancyRate * 100)}% at {fmt(v.analysis.trough.time)}
                      </button>
                    </dd>
                  </>
                )}
              </dl>
            </div>
          )}

          <ThresholdControls
            params={v.params}
            onChange={v.setParams}
            minConf={VIDEO_CONF_FLOOR}
            disabled={v.samples.size === 0}
          />

          <div className="rounded-xl border p-5" style={{ background: 'var(--bg-raised)' }}>
            <h3 className="mb-3 text-sm font-semibold">Sampling</h3>
            <div className="grid grid-cols-4 gap-1 rounded-lg p-1" style={{ background: 'var(--bg-sunken)' }}>
              {(['auto', 'fast', 'balanced', 'detailed'] as Density[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={v.running}
                  onClick={() => v.setDensity(d)}
                  aria-pressed={v.density === d}
                  className="rounded-md py-1.5 text-xs font-medium capitalize transition-colors disabled:opacity-50"
                  style={{
                    background: v.density === d ? 'var(--bg-raised)' : 'transparent',
                    boxShadow: v.density === d ? 'var(--shadow)' : 'none',
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-faint)' }}>
              {v.density === 'auto'
                ? 'Measures one frame, then sizes the walk to finish in about 20 seconds on this device.'
                : `${{ fast: 1, balanced: 2, detailed: 4 }[v.density]} frame${v.density === 'fast' ? '' : 's'} per second of video, up to 300.`}
            </p>
            {src && !v.running && v.samples.size > 0 && (
              <button
                type="button"
                onClick={() => { void v.analyze(); }}
                className="mt-3 w-full rounded-lg border py-2 text-sm font-medium"
                style={{ background: 'var(--bg-sunken)' }}
              >
                Re-analyze
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
