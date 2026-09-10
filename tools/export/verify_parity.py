"""
PyTorch <-> ONNX parity gate for the ParkWise detector.

Run AFTER export.py. Produces tools/export/fixtures/ which BOTH the vitest
suite (src/lib/detect/postprocess.test.ts) and the browser /debug/parity page
assert against.

  python verify_parity.py --weights ../../models/best.pt --onnx ../../public/models/<name>.onnx

THE PARITY TRAP
---------------
The original Flask app called `model(path, size=416)`, which goes through
AutoShape -> RECTANGULAR letterbox: a 640x480 image becomes 416x320, padded
only to a stride-32 multiple, NOT to a square.

Our exported graph is STATIC SQUARE 416x416. So the correct reference is
PyTorch fed a square-letterboxed tensor -- NOT the old site's output. Comparing
against AutoShape will show differences that look like bugs in correct code.
"""
import argparse, json, sys, pathlib
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "yolov5"))

import torch  # noqa: E402
import cv2  # noqa: E402


def letterbox_square(im, size=416, color=(114, 114, 114)):
    """Replicates yolov5 letterbox(auto=False, scaleFill=False, scaleup=True).

    This is THE reference for src/lib/detect/preprocess.ts. Keep them in sync.
    Returns (padded_bgr_image, r, pad_left, pad_top).
    """
    h0, w0 = im.shape[:2]
    r = min(size / h0, size / w0)          # scaleup=True -> r may exceed 1
    new_w, new_h = round(w0 * r), round(h0 * r)
    dw, dh = (size - new_w) / 2, (size - new_h) / 2
    left, top = round(dw - 0.1), round(dh - 0.1)
    right, bottom = round(dw + 0.1), round(dh + 0.1)
    if (w0, h0) != (new_w, new_h):
        im = cv2.resize(im, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    im = cv2.copyMakeBorder(im, top, bottom, left, right,
                            cv2.BORDER_CONSTANT, value=color)
    assert im.shape[:2] == (size, size), f"letterbox produced {im.shape[:2]}"
    return im, r, left, top


def to_tensor(padded_bgr):
    """BGR HWC uint8 -> RGB NCHW float32 /255 (what the ONNX graph expects)."""
    rgb = padded_bgr[:, :, ::-1]                       # BGR -> RGB
    chw = rgb.transpose(2, 0, 1)                       # HWC -> CHW
    return np.ascontiguousarray(chw, dtype=np.float32)[None] / 255.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", default=str(HERE.parent.parent / "models" / "best.pt"))
    ap.add_argument("--onnx", required=True)
    ap.add_argument("--image", default=None, help="sample image; defaults to GOPR6541")
    ap.add_argument("--imgsz", type=int, default=416)
    ap.add_argument("--conf", type=float, default=0.25)
    ap.add_argument("--iou", type=float, default=0.45)
    ap.add_argument("--outdir", default=str(HERE / "fixtures"))
    args = ap.parse_args()

    from models.experimental import attempt_load
    from utils.general import non_max_suppression, scale_boxes

    img_path = args.image
    if img_path is None:
        up = HERE.parent.parent / "app" / "static" / "uploads"
        cands = sorted(up.glob("GOPR6541*.jpg")) or sorted(up.glob("GOPR*.jpg"))
        assert cands, f"no GOPR sample found under {up}"
        img_path = str(cands[0])
    print(f"[i] sample image: {img_path}")

    # ---- 1. load checkpoint -------------------------------------------------
    model = attempt_load(args.weights, device="cpu", inplace=False, fuse=True)
    model.eval()
    names = model.names
    if isinstance(names, dict):
        names = [names[i] for i in range(len(names))]
    print(f"[i] class names: {names}")

    # RISK #3: inverting this silently inverts every statistic on the site
    # and nothing throws. Hard-fail here instead.
    assert list(names) == ["Occupied-Parking-Spaces", "Open-Parking-Spaces"], (
        f"CLASS ORDER CHANGED: {names}. src/lib/detect/types.ts assumes "
        f"index 0 == Occupied. Fix one or the other before shipping."
    )

    nparams = sum(p.numel() for p in model.parameters())
    print(f"[i] parameters: {nparams:,}")

    # ---- 2. preprocess ------------------------------------------------------
    im0 = cv2.imread(img_path)
    assert im0 is not None, f"cv2 could not read {img_path}"
    h0, w0 = im0.shape[:2]
    padded, r, pad_left, pad_top = letterbox_square(im0, args.imgsz)
    x = to_tensor(padded)
    print(f"[i] {w0}x{h0} -> r={r:.6f} pad_left={pad_left} pad_top={pad_top}")

    # ---- 3. PyTorch forward -------------------------------------------------
    with torch.no_grad():
        torch_out = model(torch.from_numpy(x))[0].numpy()
    print(f"[i] torch output shape: {torch_out.shape}")

    # ---- 4. ONNX forward on the IDENTICAL tensor ---------------------------
    import onnxruntime as ort
    sess = ort.InferenceSession(args.onnx, providers=["CPUExecutionProvider"])
    in_name = sess.get_inputs()[0].name
    out_name = sess.get_outputs()[0].name
    print(f"[i] onnx input='{in_name}' output='{out_name}'")
    onnx_out = sess.run([out_name], {in_name: x})[0]
    print(f"[i] onnx  output shape: {onnx_out.shape}")

    # ---- 5. asserts ---------------------------------------------------------
    ncells = sum((args.imgsz // s) ** 2 for s in (8, 16, 32))
    expected_shape = (1, ncells * 3, 5 + len(names))
    assert onnx_out.shape == expected_shape, (
        f"expected {expected_shape}, got {onnx_out.shape}"
    )
    print(f"[ok] shape == {expected_shape}")

    maxdiff = float(np.abs(torch_out - onnx_out).max())
    print(f"[i] max |torch - onnx| = {maxdiff:.3e}")
    assert np.allclose(torch_out, onnx_out, atol=1e-3, rtol=1e-3), (
        f"PARITY FAILED: max diff {maxdiff}"
    )
    print("[ok] torch/onnx allclose(atol=1e-3)")

    # ---- 6. NMS with yolov5's own implementation (the reference) -----------
    det = non_max_suppression(torch.from_numpy(onnx_out), args.conf, args.iou,
                              classes=None, agnostic=False, max_det=300)[0]
    boxes = det[:, :4].clone()
    boxes = scale_boxes((args.imgsz, args.imgsz), boxes, (h0, w0)).round()
    dets = []
    for i in range(det.shape[0]):
        x1, y1, x2, y2 = [float(v) for v in boxes[i]]
        dets.append({
            "classId": int(det[i, 5]),
            "className": names[int(det[i, 5])],
            "score": round(float(det[i, 4]), 6),
            "box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
        })
    dets.sort(key=lambda d: -d["score"])
    occupied = sum(1 for d in dets if d["classId"] == 0)
    open_ = sum(1 for d in dets if d["classId"] == 1)
    print(f"[i] detections @conf={args.conf} iou={args.iou}: "
          f"{len(dets)} total | {occupied} occupied | {open_} open")

    # ---- 7. emit fixtures ---------------------------------------------------
    out = pathlib.Path(args.outdir)
    out.mkdir(parents=True, exist_ok=True)
    stem = pathlib.Path(img_path).name.split("_")[0] or "sample"

    x.astype(np.float32).tofile(out / f"{stem}.input.bin")
    onnx_out.astype(np.float32).tofile(out / f"{stem}.raw.bin")
    meta = {
        "image": pathlib.Path(img_path).name,
        "imgsz": args.imgsz,
        "origWidth": w0, "origHeight": h0,
        "letterbox": {"r": r, "padLeft": pad_left, "padTop": pad_top,
                      "w0": w0, "h0": h0},
        "rawShape": list(onnx_out.shape),
        "classes": list(names),
        "params": {"conf": args.conf, "iou": args.iou, "maxDet": 300},
        "counts": {"total": len(dets), "occupied": occupied, "open": open_},
        "detections": dets,
    }
    (out / f"{stem}.expected.json").write_text(json.dumps(meta, indent=2))
    print(f"[ok] fixtures written to {out}")
    print("\nPARITY PASSED")


if __name__ == "__main__":
    main()
