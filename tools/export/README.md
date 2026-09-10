# ParkWise — model export pipeline

One-time, offline. Converts the 2022 PyTorch checkpoint (`models/best.pt`) into
the ONNX graph the website runs in the browser (`public/models/parkwise-*.onnx`).

Nothing here ships to production. Vercel never runs Python.

## Why the pins are what they are

| Pin | Reason |
|---|---|
| **Python 3.11** | `onnxsim` (for `--simplify`) has no 3.13 Windows wheels and fails to build. |
| **torch==2.5.1** | torch 2.6 flipped `torch.load` to `weights_only=True`, which hard-fails on this checkpoint — it pickles live `models.yolo.Model` objects, not a state_dict. Pinning below 2.6 avoids the problem instead of patching around it. |
| **yolov5 tag v7.0** | Closest tag to the July 2022 checkpoint. Critically, v7.0 declares `Detect.stride/dynamic/export` as *class* attributes, so 2022 instances that lack them in `__dict__` inherit working defaults. `master` has drifted further. |
| **numpy<2** | NumPy 2 breaks yolov5 v7.0's `utils/` in several places. |

## Setup

```powershell
py -3.11 -m venv tools\export\.venv
tools\export\.venv\Scripts\pip.exe install torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cpu
tools\export\.venv\Scripts\pip.exe install "numpy<2" onnx==1.17.0 onnxsim==0.4.36 onnxruntime==1.20.1 opencv-python pillow pyyaml requests scipy tqdm psutil pandas seaborn matplotlib gitpython
git clone --branch v7.0 --depth 1 https://github.com/ultralytics/yolov5 tools\export\yolov5
```

## Export

```powershell
cd tools\export\yolov5
..\.venv\Scripts\python.exe export.py --weights ..\..\..\models\best.pt `
  --imgsz 416 416 --batch-size 1 --include onnx --opset 12 --simplify
```

Then content-hash the filename so it can be cached immutably:

```powershell
$h = (Get-FileHash models\best.onnx -Algorithm SHA256).Hash.Substring(0,8).ToLower()
Move-Item models\best.onnx "public\models\parkwise-416.$h.onnx"
```

## Verify (do not skip)

```powershell
cd tools\export
.venv\Scripts\python.exe verify_parity.py --onnx ..\..\public\models\parkwise-416.<hash>.onnx
```

This asserts torch/ONNX agreement, asserts the output shape, asserts the class
order, and emits `fixtures/` — which the vitest suite and the browser
`/debug/parity` page both assert against.

---

## ⚠ THE PARITY TRAP — read before debugging any mismatch

**Do not compare against the original Flask app's output.**

The 2022 app called `model(image_path, size=416)`. That goes through YOLOv5's
`AutoShape`, which letterboxes **rectangularly** — it pads only to a stride-32
multiple, not to a square. A 640×480 image therefore became **416×320**.

Our exported graph is **static square 416×416**.

So the two disagree by construction. Boxes will differ enough to look like a
bug when your code is completely correct. The correct reference is PyTorch fed
a **square**-letterboxed tensor, which is exactly what `verify_parity.py` does.

## Model facts (verified from the checkpoint, not assumed)

- YOLOv5s, `nc=2`, `depth_multiple=0.33`, `width_multiple=0.5`
- **`names = ['Occupied-Parking-Spaces', 'Open-Parking-Spaces']` → index 0 is Occupied**
- Anchors are the **stock YOLOv5 COCO defaults**, i.e. *not* evolved for this
  dataset: `[[10,13, 16,30, 33,23], [30,61, 62,45, 59,119], [116,90, 156,198, 373,326]]`.
  Worth knowing — it's why exporting at both 416 and 640 and comparing on the
  sample images is worth the ten minutes, rather than assuming 416 wins.
- Checkpoint date `2022-07-07`, `epoch = -1` (stripped for inference)
- Output at 416: `[1, 10647, 7]` — (52²+26²+13²) × 3 anchors, `4 xywh + 1 obj + 2 cls`

## The Detect decode is INSIDE the graph

The sigmoid, grid offset, and stride multiply all happen in ONNX. JavaScript
receives `xywh` already in **input-pixel space (0..416, post-letterbox)** with
sigmoids applied. JS needs **no anchors, no strides, no grids**.

This is the single most common thing people get wrong when hand-porting YOLOv5
to the browser. See `src/lib/detect/postprocess.ts`.

## If export fails

1. `torch.load` throws → add `weights_only=False` in `models/experimental.py`
   (only needed if you ignored the torch pin).
2. `AttributeError` on a `Detect` attribute → use `export_min.py`, which
   bypasses `export.py`'s CLI plumbing and calls `torch.onnx.export` directly.
3. `--simplify` crashes → drop it. Larger and slower, but correct.
4. Unpickling fails outright → rebuild from `ckpt['model'].yaml` and
   `load_state_dict`.
5. torch won't install on Windows → run the export in Google Colab and download
   the `.onnx`. Guaranteed escape hatch, ~20 minutes.
