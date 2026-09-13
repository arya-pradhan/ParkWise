# Retraining the detector on PKLot

The 2022 model was trained on ~250 frames from one camera over one lot. Its
problems in the app — duplicate boxes, edge hallucinations, collapse on unseen
lots — are all data problems. This retrains the same YOLOv5s architecture on
**PKLot** (12,416 images, 3 lots, sunny / overcast / rainy, ~700k labeled
spaces) so the result is a drop-in for the existing export and browser pipeline.

Dataset: Almeida, Oliveira, Silva Jr, Britto Jr, Koerich, *"PKLot – A robust
dataset for parking lot classification"*, Expert Systems with Applications
42(11), 2015. Distributed via Roboflow under **CC BY 4.0** — attribution is
required and lives on the model card and in the root README.

## Run it

Open `pklot_colab.ipynb` in Google Colab (File → Upload notebook, or open from
GitHub). It is self-contained and documented cell by cell. You need:

- a GPU runtime (Colab Pro: A100 or L4; ~1 min/epoch, ~1 hour total)
- `ROBOFLOW_API_KEY` in Colab **Secrets** — never in a cell, never in the repo
- `models/best-2022.pt` uploaded to `MyDrive/parkwise-runs/` for the
  before/after comparison
- the three Roboflow slug values in cell 3, confirmed from the Universe
  download dialog ("YOLO v5 PyTorch" → "show download code")

It produces `parkwise-retrain.zip` on Drive containing `best.pt`, the training
curves and confusion matrix, `val.py` results for both models on the same test
split, and 8 sample test images for the site's gallery.

## ⚠ The class-order trap

The app assumes **index 0 = Occupied, index 1 = Open**. That invariant is
asserted in `tools/export/verify_parity.py`, tested in
`src/lib/detect/postprocess.test.ts`, and relied on throughout `src/lib/detect/`.
Getting it backwards inverts every statistic on the site and nothing throws.

Roboflow orders PKLot's classes alphabetically, which puts `space-empty` at
index 0 — the **opposite** of the app.

`remap_labels.py` (cell 4) fixes this on the *dataset* side: it swaps the class
ids in every label file and rewrites `data.yaml` `names` to the exact strings
the 2022 checkpoint used. The trained `best.pt` therefore carries identical
`names`, every existing assert keeps passing, and the app needs no class-mapping
change at all. Do not skip that cell.

## Why the toolchain is pinned

Cell 2 installs `torch==2.5.1` and clones yolov5 at tag `v7.0` — the same pins
as `tools/export/`. torch ≥ 2.6 changed `torch.load` to `weights_only=True`,
which breaks v7.0's `train.py` loading the pretrained `yolov5s.pt`. Matching the
local export venv also guarantees the checkpoint round-trips through
`export.py` without unpickling surprises.

## After training

Unzip `parkwise-retrain.zip` into the repo:

| From the zip | To |
|---|---|
| `pklot/weights/best.pt` | `models/best.pt` |
| `pklot/confusion_matrix.png` | `public/model-card/confusion_matrix.png` |
| `pklot/results.csv` | `public/model-card/results.csv` (optional, for the card) |
| `samples/pklot-*.jpg` | `public/samples/` |
| `val-2022/`, `val-2026/` | read the "all" row of each — P, R, mAP50, mAP50-95 |

Then export at 640 and verify, from `tools/export/`:

```powershell
cd yolov5
..\.venv\Scripts\python.exe export.py --weights ..\..\..\models\best.pt --imgsz 640 640 --batch-size 1 --include onnx --opset 12 --simplify
cd ..
# hash-name into public/models/parkwise-640.<sha8>.onnx (see tools/export/README.md)
.venv\Scripts\python.exe verify_parity.py --onnx ..\..\public\models\parkwise-640.<sha8>.onnx --imgsz 640 --sample GOPR6541
.venv\Scripts\python.exe verify_parity.py --onnx ..\..\public\models\parkwise-640.<sha8>.onnx --imgsz 640 --sample pklot-01
```

Expected output shape at 640 is `(1, 25200, 7)` — (80² + 40² + 20²) × 3 anchors.

The remaining integration (`INPUT_SIZE`, `MODEL_URL`, fixture shapes, gallery
manifest, hero, model card) is listed in the plan and is mechanical; the tests
lead you through it.
