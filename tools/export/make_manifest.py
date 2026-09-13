"""Generate public/samples/manifest.json for the sample gallery.

Runs the shipped 416 model over each sample so the gallery can sort by
occupancy and label each thumbnail. Counts are advisory only — the site
recomputes them live in the browser.
"""
import sys, json, pathlib, glob, re
import numpy as np, cv2, torch
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "yolov5"))
import onnxruntime as ort
from utils.general import non_max_suppression
from verify_parity import letterbox_square, to_tensor

ROOT = HERE.parent.parent
onnx_path = sorted((ROOT / "public" / "models").glob("parkwise-*.onnx"))[-1]
IMGSZ = int(re.search(r"parkwise-(\d+)\.", onnx_path.name).group(1))
print(f"[i] model {onnx_path.name} @ {IMGSZ}")
sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
inn, outn = sess.get_inputs()[0].name, sess.get_outputs()[0].name

# PKLot frames (in-distribution for the 2026 model) are featured. The 2022
# fisheye lot is kept as the out-of-distribution demonstration — the model was
# never trained on it, so it is the honest "how does it generalise" sample.
TITLES = {
    "pklot-01": ("PKLot", None), "pklot-02": ("PKLot", None), "pklot-03": ("PKLot", None),
    "pklot-04": ("PKLot", None), "pklot-05": ("PKLot", None), "pklot-06": ("PKLot", None),
    "pklot-07": ("PKLot", None), "pklot-08": ("PKLot", None),
    "example-empty": ("2022 lot · empty", "Out of distribution"),
    "example-full":  ("2022 lot · busy", "Out of distribution"),
    "example-hard":  ("2022 lot · dense", "Out of distribution"),
    "phone-lot-1":   ("Phone photo", "Handheld, off-angle"),
    "phone-lot-2":   ("Phone photo, portrait", "Handheld, off-angle"),
    "overhead_lot_1": ("Overhead lot", "Straight-down view"),
}
FEATURED = {k for k in TITLES if k.startswith("pklot-")}

out = []
for p in sorted(glob.glob(str(ROOT / "public" / "samples" / "*.jpg"))):
    name = pathlib.Path(p).stem
    im0 = cv2.imread(p)
    h0, w0 = im0.shape[:2]
    padded, r, pl, pt = letterbox_square(im0, IMGSZ)
    res = sess.run([outn], {inn: to_tensor(padded)})[0]
    det = non_max_suppression(torch.from_numpy(res), 0.25, 0.45, max_det=300)[0]
    cls = det[:, 5].numpy().astype(int)
    occ, opn = int((cls == 0).sum()), int((cls == 1).sum())
    tot = occ + opn
    title, sub = TITLES.get(name, ("2022 lot " + name.replace("GOPR", "#"), None))
    if name.startswith("pklot-"):
        title = f"PKLot {name[-2:]}"
    if sub is None:
        sub = f"{opn} free of {tot}" if tot else "No spaces found"
    out.append({
        "file": f"/samples/{pathlib.Path(p).name}",
        "id": name,
        "title": title,
        "caption": sub,
        "width": w0, "height": h0,
        "featured": name in FEATURED,
        "expected": {"occupied": occ, "open": opn, "total": tot,
                     "occupancyRate": round(occ / tot, 4) if tot else 0},
    })

out.sort(key=lambda d: (not d["featured"], d["expected"]["occupancyRate"]))
dst = ROOT / "public" / "samples" / "manifest.json"
dst.write_text(json.dumps(out, indent=2))
print(f"wrote {dst} ({len(out)} samples)")
for d in out:
    print(f"  {d['id']:16s} {d['width']}x{d['height']:<5d} "
          f"{d['expected']['occupied']:3d} occ / {d['expected']['open']:3d} open   {d['title']}")
