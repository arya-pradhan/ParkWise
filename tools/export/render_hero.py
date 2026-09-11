"""Render one clean annotated sample for the landing page hero."""
import sys, pathlib
import numpy as np, cv2, torch
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "yolov5"))
import onnxruntime as ort
from utils.general import non_max_suppression
from verify_parity import letterbox_square, to_tensor

ROOT = HERE.parent.parent
onnx_path = sorted((ROOT / "public" / "models").glob("parkwise-416.*.onnx"))[0]
sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
inn, outn = sess.get_inputs()[0].name, sess.get_outputs()[0].name

src = ROOT / "public" / "samples" / (sys.argv[1] if len(sys.argv) > 1 else "example-full.jpg")
img = cv2.imread(str(src))
h0, w0 = img.shape[:2]
padded, r, pl, pt = letterbox_square(img, 416)
out = sess.run([outn], {inn: to_tensor(padded)})[0]
det = non_max_suppression(torch.from_numpy(out), 0.35, 0.45, max_det=300)[0]

# upscale 2x so the lines stay crisp on retina
S = 2
vis = cv2.resize(img, (w0 * S, h0 * S), interpolation=cv2.INTER_CUBIC)
OPEN, OCC = (123, 199, 52), (92, 77, 244)   # BGR of the site's emerald / rose
for *xyxy, cf, cl in det.tolist():
    x1, y1, x2, y2 = [((v - (pl if i % 2 == 0 else pt)) / r) * S for i, v in enumerate(xyxy)]
    x1, x2 = max(0, min(w0*S, x1)), max(0, min(w0*S, x2))
    y1, y2 = max(0, min(h0*S, y1)), max(0, min(h0*S, y2))
    p1, p2 = (int(x1), int(y1)), (int(x2), int(y2))
    if int(cl) == 1:
        cv2.rectangle(vis, p1, p2, OPEN, 3, cv2.LINE_AA)
    else:
        # dashed for occupied, matching the canvas overlay
        for (a, b) in [((p1[0], p1[1]), (p2[0], p1[1])), ((p2[0], p1[1]), (p2[0], p2[1])),
                       ((p2[0], p2[1]), (p1[0], p2[1])), ((p1[0], p2[1]), (p1[0], p1[1]))]:
            L = int(np.hypot(b[0]-a[0], b[1]-a[1])); n = max(1, L // 14)
            for k in range(n):
                t0, t1 = k / n, (k + 0.6) / n
                q0 = (int(a[0] + (b[0]-a[0])*t0), int(a[1] + (b[1]-a[1])*t0))
                q1 = (int(a[0] + (b[0]-a[0])*t1), int(a[1] + (b[1]-a[1])*t1))
                cv2.line(vis, q0, q1, OCC, 3, cv2.LINE_AA)

dst = ROOT / "public" / "hero.jpg"
cv2.imencode(".jpg", vis, [cv2.IMWRITE_JPEG_QUALITY, 82])[1].tofile(str(dst))  # yolov5 monkey-patches imwrite
cls = det[:, 5].numpy().astype(int)
print(f"wrote {dst} {vis.shape[1]}x{vis.shape[0]} — {(cls==0).sum()} occ / {(cls==1).sum()} open — {dst.stat().st_size//1024}KB")
