'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Detection } from '@/lib/detect/types';

/**
 * Boxes are drawn client-side on a canvas layered over the image, rather than
 * baked into a JPEG server-side as the 2022 app did. That is what makes them
 * hoverable and what lets a threshold change redraw instantly.
 *
 * The canvas backing store is sized to the image's natural dimensions and
 * CSS-scaled to fit, so every coordinate below is in original-image space and
 * needs no conversion.
 */
export function DetectionCanvas({
  src,
  width,
  height,
  detections,
  hoveredId,
  onHover,
  showLabels = true,
}: {
  src: string;
  width: number;
  height: number;
  detections: Detection[];
  hoveredId: number | null;
  onHover: (id: number | null) => void;
  showLabels?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // Scale line weights to the image so a 4000px photo doesn't get hairlines.
    const k = Math.max(1, Math.min(width, height) / 480);

    for (const d of detections) {
      const open = d.classId === 1;
      const color = open ? 'rgb(52, 199, 123)' : 'rgb(244, 77, 92)';
      const hot = d.id === hoveredId;
      const w = d.box.x2 - d.box.x1;
      const h = d.box.y2 - d.box.y1;

      ctx.save();
      ctx.lineWidth = (hot ? 3 : 1.75) * k;
      ctx.strokeStyle = color;
      // Occupied is dashed as well as red, so the two classes stay separable
      // without relying on color alone.
      ctx.setLineDash(open ? [] : [6 * k, 3 * k]);

      if (hot) {
        ctx.fillStyle = open ? 'rgba(52,199,123,0.22)' : 'rgba(244,77,92,0.22)';
        ctx.fillRect(d.box.x1, d.box.y1, w, h);
        ctx.shadowColor = color;
        ctx.shadowBlur = 12 * k;
      }
      ctx.strokeRect(d.box.x1, d.box.y1, w, h);
      ctx.restore();

      if (showLabels && hot) {
        const text = `${open ? 'Open' : 'Occupied'} ${Math.round(d.score * 100)}%`;
        ctx.save();
        ctx.font = `600 ${12 * k}px ui-sans-serif, system-ui, sans-serif`;
        const pad = 5 * k;
        const tw = ctx.measureText(text).width;
        const th = 17 * k;
        // Flip the chip below the box when it would run off the top edge.
        const ly = d.box.y1 - th - 2 * k < 0 ? d.box.y2 + 2 * k : d.box.y1 - th - 2 * k;
        const lx = Math.min(d.box.x1, width - tw - pad * 2);
        ctx.fillStyle = color;
        ctx.fillRect(lx, ly, tw + pad * 2, th);
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, lx + pad, ly + th / 2);
        ctx.restore();
      }
    }
  }, [detections, hoveredId, width, height, showLabels]);

  const handleMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const cv = canvasRef.current;
      if (!cv) return;
      const rect = cv.getBoundingClientRect();
      const x = ((e.clientX - rect.left) * width) / rect.width;
      const y = ((e.clientY - rect.top) * height) / rect.height;

      // Smallest containing box wins, so boxes nested inside larger ones stay
      // reachable rather than being permanently shadowed.
      let best: Detection | null = null;
      let bestArea = Infinity;
      for (const d of detections) {
        if (x < d.box.x1 || x > d.box.x2 || y < d.box.y1 || y > d.box.y2) continue;
        const area = (d.box.x2 - d.box.x1) * (d.box.y2 - d.box.y1);
        if (area < bestArea) {
          bestArea = area;
          best = d;
        }
      }
      onHover(best ? best.id : null);
    },
    [detections, width, height, onHover],
  );

  return (
    <div
      className="relative overflow-hidden rounded-xl border"
      style={{ background: 'var(--bg-sunken)' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Parking lot being analyzed"
        width={width}
        height={height}
        className="block h-auto w-full select-none"
        draggable={false}
      />
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0 h-full w-full"
        onPointerMove={handleMove}
        onPointerLeave={() => onHover(null)}
      />
    </div>
  );
}
