"""Synthesize e2e/fixtures/lot-timelapse.webm from sample frames.

Test fixture ONLY — not shipped. Sequences lots of varying occupancy so the
timeline has something to chart. Each frame is held for `hold` seconds.
"""
import sys, pathlib, cv2
ROOT = pathlib.Path(__file__).resolve().parents[2]
# PKLot frames, in-distribution for the retrained model. Ordered to sweep
# occupancy so the timeline has something to chart; make_manifest.py prints
# per-sample counts — reorder here if the sweep looks flat.
seq = ["pklot-01", "pklot-02", "pklot-03", "pklot-04", "pklot-05",
       "pklot-06", "pklot-07", "pklot-08", "pklot-01"]
fps, hold = 10, 1.0
dst = ROOT / "e2e" / "fixtures" / "lot-timelapse.webm"
dst.parent.mkdir(parents=True, exist_ok=True)
w = None
for fourcc, ext in (("VP90", ".webm"), ("VP80", ".webm"), ("mp4v", ".mp4")):
    out = dst.with_suffix(ext)
    w = cv2.VideoWriter(str(out), cv2.VideoWriter_fourcc(*fourcc), fps, (640, 480))
    if w.isOpened():
        print("codec:", fourcc, "->", out.name); dst = out; break
    w.release(); w = None
assert w, "no usable codec"
for name in seq:
    im = cv2.imread(str(ROOT / "public" / "samples" / f"{name}.jpg"))
    im = cv2.resize(im, (640, 480))
    for _ in range(int(fps * hold)):
        w.write(im)
w.release()
print(f"wrote {dst} ({dst.stat().st_size // 1024}KB, {len(seq) * hold:.0f}s)")
