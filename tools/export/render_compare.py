"""Render 416 vs 640 detections side by side so the choice can be eyeballed."""
import sys, pathlib
import numpy as np, cv2, torch
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "yolov5"))
import onnxruntime as ort
from utils.general import non_max_suppression
from verify_parity import letterbox_square, to_tensor

ROOT = HERE.parent.parent
OCC, OPEN = (60, 60, 235), (80, 200, 120)   # BGR: rose / emerald

def run(onnx_path, img, size):
    sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    inn, outn = sess.get_inputs()[0].name, sess.get_outputs()[0].name
    h0, w0 = img.shape[:2]
    padded, r, pl, pt = letterbox_square(img, size)
    out = sess.run([outn], {inn: to_tensor(padded)})[0]
    det = non_max_suppression(torch.from_numpy(out), 0.25, 0.45, max_det=300)[0]
    vis = img.copy()
    occ = opn = 0
    for *xyxy, cf, cl in det.tolist():
        x1, y1, x2, y2 = [(v - (pl if i % 2 == 0 else pt)) / r for i, v in enumerate(xyxy)]
        x1, x2 = max(0, min(w0, x1)), max(0, min(w0, x2))
        y1, y2 = max(0, min(h0, y1)), max(0, min(h0, y2))
        c = int(cl)
        occ += c == 0; opn += c == 1
        cv2.rectangle(vis, (int(x1), int(y1)), (int(x2), int(y2)), OCC if c == 0 else OPEN, 2)
    tot = occ + opn
    pct = f"{100*occ/tot:.0f}%" if tot else "n/a"
    bar = np.full((34, w0, 3), 25, np.uint8)
    cv2.putText(bar, f"{size}px  {occ} occupied / {opn} open  ({pct} full)",
                (8, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (240, 240, 240), 1, cv2.LINE_AA)
    return np.vstack([bar, vis])

names = sys.argv[1:] or ["GOPR6541", "3example-good-full", "2example-good-empty"]
up = ROOT / "app" / "static" / "uploads"
rows = []
for nm in names:
    cands = sorted(up.glob(f"{nm}*.jpg"))
    if not cands:
        print(f"[skip] {nm}"); continue
    img = cv2.imread(str(cands[0]))
    a = run(str(ROOT / "models" / "best.onnx"), img, 416)
    b = run(str(ROOT / "models" / "best-640.onnx"), img, 640)
    gap = np.full((a.shape[0], 12, 3), 25, np.uint8)
    rows.append(np.hstack([a, gap, b]))
w = max(r.shape[1] for r in rows)
rows = [np.pad(r, ((0, 0), (0, w - r.shape[1]), (0, 0)), constant_values=25) for r in rows]
sep = np.full((14, w, 3), 25, np.uint8)
out = rows[0]
for r in rows[1:]:
    out = np.vstack([out, sep, r])
dst = ROOT / "tools" / "export" / "compare_416_vs_640.png"
cv2.imwrite(str(dst), out)
print(f"wrote {dst}  ({out.shape[1]}x{out.shape[0]})")
