# ParkWise

Finds open parking spaces in a photo, and runs the neural network **entirely in
your browser** — no server, no upload, no cost.

Point it at an overhead shot of a parking lot and it reports how many spaces are
free, how many are taken, and where each one is.

> Originally an AI Camp summer project from 2022 (Flask + server-side PyTorch).
> Rebuilt in 2026 as a static Next.js app running the same weights as ONNX in
> the browser. The original is archived in [`legacy/`](./legacy).

## How it works

1. Your image is letterboxed to 416×416 on a canvas — never uploaded anywhere.
2. A YOLOv5s detector runs via [onnxruntime-web](https://onnxruntime.ai/docs/tutorials/web/),
   on WebGPU where available and WASM otherwise.
3. The raw output tensor is decoded in TypeScript — confidence filtering,
   class-wise NMS, and un-letterboxing back to your image's coordinates.
4. Boxes are drawn on a canvas layered over the image, and the counts are
   aggregated into occupancy statistics.

Because the raw tensor stays in memory, the confidence and IoU sliders re-filter
in under 2ms **without re-running the model**.

## Model

| | |
|---|---|
| Architecture | YOLOv5s — 213 layers, 7,015,519 parameters |
| Classes | `0 = Occupied-Parking-Spaces`, `1 = Open-Parking-Spaces` |
| Training data | ~250 Roboflow-labeled aerial frames, one lot, 2022-07-07 |
| Input | `1×3×416×416` fp32, RGB, /255, letterboxed to `rgb(114,114,114)` |
| Output | `1×10647×7` — (52²+26²+13²) × 3 anchors, `4 xywh + 1 obj + 2 cls` |
| Shipped as | ONNX opset 12, simplified, 27MB fp32 |

It is a small model trained on a small, narrow dataset. It works well on
overhead views resembling its training data and degrades on anything else. See
the model card page in the app for measured limitations.

## Develop

```bash
npm install
npm run dev
```

`predev`/`prebuild` copy the onnxruntime-web `.wasm` binaries and ESM bundle
into `public/ort/`, so no CDN is involved. The detector worker imports ORT at
runtime from there rather than bundling it — ORT spawns its own threads with
`new Worker(import.meta.url)`, and a bundled `import.meta.url` becomes a
`file://` path the browser refuses.

## Verify

Three layers, each isolating a different bug class:

```bash
npm test          # vitest: TypeScript decode vs yolov5's own NMS, on fixtures
npm run build && npm start
npm run e2e       # Playwright/headless Chromium: full browser path
```

- **`tools/export/verify_parity.py`** — PyTorch vs ONNX on the same tensor, and
  a hard assertion on class order. Emits the fixtures.
- **`npm test`** — loads the raw output tensor, skipping preprocessing, and
  asserts every box and score against yolov5's own `non_max_suppression`.
  If this passes and the browser disagrees, the bug is in the letterbox.
- **`npm run e2e`** — drives `/debug/parity` (full canvas → worker → decode path
  vs the PyTorch fixture, PASS/FAIL with per-box deltas), `/detect`, and
  `/detect/video` in headless Chromium. Asserts cross-origin isolation, that
  sliders re-filter without re-running inference, and zero console errors.

The Playwright browser is a one-time `npx playwright install chromium`.

## Deploy

Vercel, framework preset **Next.js**, no configuration needed — everything is
in `next.config.ts`. The whole site prerenders; there are no serverless
functions. `public/` is ~60MB (model + wasm), which is well within limits.

After deploying, open the browser console on `/detect` and confirm
`crossOriginIsolated === true`; the model status line should read
**WASM · 4 threads** or **WebGPU**. If it says single-threaded, the COOP/COEP
headers are not reaching the browser.

## Re-exporting the model

The `.onnx` in `public/models/` is committed, so you only need this if you
retrain. See [`tools/export/README.md`](./tools/export/README.md) — it documents
the version pins, the parity harness, and the rectangular-vs-square letterbox
trap that will otherwise cost you an afternoon.

```bash
cd tools/export
.venv/Scripts/python.exe verify_parity.py --onnx ../../public/models/parkwise-416.47903169.onnx
```

## Layout

| Path | What |
|---|---|
| `src/lib/detect/` | Preprocessing, decode, NMS — the detection core |
| `src/workers/` | The only module that imports onnxruntime-web |
| `public/models/` | The shipped ONNX graph (content-hashed, cached immutably) |
| `public/samples/` | 20 sample lot images + manifest |
| `models/best.pt` | Source-of-truth PyTorch checkpoint |
| `tools/export/` | Offline export + parity harness (never ships) |
| `legacy/` | The archived 2022 Flask app |

## License

The application code is this repository's own. The detector is derived from
[Ultralytics YOLOv5](https://github.com/ultralytics/yolov5), which is
**AGPL-3.0** — the exported weights and the reimplemented decode are plausibly
derivative works. A license file has deliberately not been chosen here; see
the note in the project history.

## Credits

Built in 2022 by Arya Pradhan, Akira Suzuki, Alex Loan, Dev Patel, Leo Tjong,
and Prisha Sharma through [AI Camp](https://ai-camp.org).

Detector architecture and export tooling from
[Ultralytics YOLOv5](https://github.com/ultralytics/yolov5) (AGPL-3.0).
