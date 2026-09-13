"""Render two models side by side on the same images so a choice can be eyeballed.

  python render_compare.py --a <onnx>:<size> --b <onnx>:<size> [--label-a ..] [--label-b ..] [images...]

Examples
  # 2022 model vs retrained, on a fisheye frame and a PKLot frame
  python render_compare.py --a ../../models/best-2022-416.onnx:416 --b ../../public/models/parkwise-640.xxxx.onnx:640 \
      --label-a "2022 · 250 imgs" --label-b "2026 · PKLot" example-full pklot-01 GOPR6541

Image args are stems in public/samples/. Output: tools/export/compare.png
"""
import sys, pathlib, argparse
import numpy as np, cv2, torch
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "yolov5"))
import onnxruntime as ort
from utils.general import non_max_suppression
from verify_parity import letterbox_square, to_tensor

ROOT = HERE.parent.parent
OCC, OPEN = (60, 60, 235), (80, 200, 120)   # BGR: rose / emerald


def parse_model(spec: str):
    path, _, size = spec.rpartition(":")
    return str((HERE / path).resolve() if not pathlib.Path(path).is_absolute() else path), int(size)


def run(sess, img, size, conf=0.25, iou=0.45):
    inn, outn = sess.get_inputs()[0].name, sess.get_outputs()[0].name
    h0, w0 = img.shape[:2]
    padded, r, pl, pt = letterbox_square(img, size)
    out = sess.run([outn], {inn: to_tensor(padded)})[0]
    det = non_max_suppression(torch.from_numpy(out), conf, iou, max_det=300)[0]
    vis = img.copy()
    occ = opn = 0
    for *xyxy, cf, cl in det.tolist():
        x1, y1, x2, y2 = [(v - (pl if i % 2 == 0 else pt)) / r for i, v in enumerate(xyxy)]
        x1, x2 = max(0, min(w0, x1)), max(0, min(w0, x2))
        y1, y2 = max(0, min(h0, y1)), max(0, min(h0, y2))
        c = int(cl)
        occ += c == 0; opn += c == 1
        cv2.rectangle(vis, (int(x1), int(y1)), (int(x2), int(y2)), OCC if c == 0 else OPEN, 2)
    return vis, occ, opn


def panel(vis, label, size, occ, opn):
    tot = occ + opn
    pct = f"{100*occ/tot:.0f}%" if tot else "n/a"
    bar = np.full((34, vis.shape[1], 3), 25, np.uint8)
    cv2.putText(bar, f"{label} @{size}  {occ} occ / {opn} open  ({pct} full)",
                (8, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (240, 240, 240), 1, cv2.LINE_AA)
    return np.vstack([bar, vis])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--a", required=True, help="<onnx path>:<input size>")
    ap.add_argument("--b", required=True, help="<onnx path>:<input size>")
    ap.add_argument("--label-a", default="A")
    ap.add_argument("--label-b", default="B")
    ap.add_argument("--out", default=str(HERE / "compare.png"))
    ap.add_argument("images", nargs="*", default=["example-full", "GOPR6541", "example-empty"])
    args = ap.parse_args()

    (pa, sa), (pb, sb) = parse_model(args.a), parse_model(args.b)
    sess_a = ort.InferenceSession(pa, providers=["CPUExecutionProvider"])
    sess_b = ort.InferenceSession(pb, providers=["CPUExecutionProvider"])

    samples = ROOT / "public" / "samples"
    rows = []
    for stem in args.images:
        cands = sorted(samples.glob(f"{stem}*.jpg"))
        if not cands:
            print(f"[skip] {stem}"); continue
        img = cv2.imread(str(cands[0]))
        # normalise width so panels line up
        if img.shape[1] != 640:
            s = 640 / img.shape[1]
            img = cv2.resize(img, (640, int(img.shape[0] * s)))
        va, oa, na = run(sess_a, img, sa)
        vb, ob, nb = run(sess_b, img, sb)
        a = panel(va, args.label_a, sa, oa, na)
        b = panel(vb, args.label_b, sb, ob, nb)
        gap = np.full((a.shape[0], 12, 3), 25, np.uint8)
        rows.append(np.hstack([a, gap, b]))
        print(f"{stem:16s} {args.label_a}: {oa:3d}/{na:3d}   {args.label_b}: {ob:3d}/{nb:3d}")

    w = max(r.shape[1] for r in rows)
    rows = [np.pad(r, ((0, 0), (0, w - r.shape[1]), (0, 0)), constant_values=25) for r in rows]
    sep = np.full((14, w, 3), 25, np.uint8)
    out = rows[0]
    for r in rows[1:]:
        out = np.vstack([out, sep, r])
    cv2.imencode(".png", out)[1].tofile(args.out)   # yolov5 monkey-patches cv2.imwrite
    print(f"wrote {args.out}  ({out.shape[1]}x{out.shape[0]})")


if __name__ == "__main__":
    main()
