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

`predev`/`prebuild` copy the onnxruntime-web `.wasm` binaries into
`public/ort/`, so no CDN is involved.

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

## Credits

Built in 2022 by Arya Pradhan, Akira Suzuki, Alex Loan, Dev Patel, Leo Tjong,
and Prisha Sharma through [AI Camp](https://ai-camp.org).

Detector architecture and export tooling from
[Ultralytics YOLOv5](https://github.com/ultralytics/yolov5) (AGPL-3.0).
