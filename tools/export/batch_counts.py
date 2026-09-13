"""Sanity sweep: run the ONNX graph over every sample and report class counts.

Named samples carry ground truth ("...good-full", "...good-empty"), so this is a
cheap check that the class mapping is not inverted and the model is not just
emitting one class for everything.
"""
import sys, pathlib, glob, re
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "yolov5"))
import torch, cv2, onnxruntime as ort
from utils.general import non_max_suppression
from verify_parity import letterbox_square, to_tensor

onnx_path = sys.argv[1] if len(sys.argv) > 1 else str(sorted((HERE.parent.parent / "public" / "models").glob("parkwise-*.onnx"))[-1])
IMGSZ = int(sys.argv[2]) if len(sys.argv) > 2 else int(re.search(r"parkwise-(\d+)\.", onnx_path).group(1) if "parkwise-" in onnx_path else 640)
sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
inn, outn = sess.get_inputs()[0].name, sess.get_outputs()[0].name

up = HERE.parent.parent / "public" / "samples"
files = sorted(glob.glob(str(up / "*.jpg")))
skip = ("Arya_profile", "bush", "car", "key", "pickaxe", "rubiks",
        "gettyimages", "istockphoto")
files = [f for f in files if not any(s in f for s in skip)]

print(f"{'image':46s} {'W x H':11s} {'occ':>4s} {'open':>5s} {'tot':>4s}  {'%full':>6s}")
print("-" * 84)
for f in files:
    im0 = cv2.imread(f)
    if im0 is None:
        continue
    h0, w0 = im0.shape[:2]
    padded, r, pl, pt = letterbox_square(im0, IMGSZ)
    x = to_tensor(padded)
    out = sess.run([outn], {inn: x})[0]
    det = non_max_suppression(torch.from_numpy(out), 0.25, 0.45, max_det=300)[0]
    cls = det[:, 5].numpy().astype(int)
    occ = int((cls == 0).sum()); opn = int((cls == 1).sum()); tot = occ + opn
    pct = f"{100*occ/tot:.0f}%" if tot else "n/a"
    print(f"{pathlib.Path(f).name[:46]:46s} {w0:4d} x {h0:4d} {occ:4d} {opn:5d} {tot:4d}  {pct:>6s}")
