"""Generate public/samples/manifest.json for the sample gallery.

Runs the shipped 416 model over each sample so the gallery can sort by
occupancy and label each thumbnail. Counts are advisory only — the site
recomputes them live in the browser.
"""
import sys, json, pathlib, glob
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

TITLES = {
    "example-empty": ("Empty lot", "Nearly every space free"),
    "example-full":  ("Busy lot", "Most spaces taken"),
    "example-hard":  ("Hard case", "Dense rows, heavy overlap"),
    "phone-lot-1":   ("Phone photo", "Handheld, not the training camera"),
    "phone-lot-2":   ("Phone photo, portrait", "Portrait crop, off-angle"),
    "overhead_lot_1": ("Overhead lot", "Straight-down view"),
}

out = []
for p in sorted(glob.glob(str(ROOT / "public" / "samples" / "*.jpg"))):
    name = pathlib.Path(p).stem
    im0 = cv2.imread(p)
    h0, w0 = im0.shape[:2]
    padded, r, pl, pt = letterbox_square(im0, 416)
    res = sess.run([outn], {inn: to_tensor(padded)})[0]
    det = non_max_suppression(torch.from_numpy(res), 0.25, 0.45, max_det=300)[0]
    cls = det[:, 5].numpy().astype(int)
    occ, opn = int((cls == 0).sum()), int((cls == 1).sum())
    tot = occ + opn
    title, sub = TITLES.get(name, ("Lot " + name.replace("GOPR", "#"), None))
    if sub is None:
        sub = f"{opn} free of {tot}" if tot else "No spaces found"
    out.append({
        "file": f"/samples/{pathlib.Path(p).name}",
        "id": name,
        "title": title,
        "caption": sub,
        "width": w0, "height": h0,
        "featured": name in TITLES,
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
