"""
Make a Roboflow YOLOv5 export match the app's class invariant.

  python remap_labels.py <dataset_dir>

THE CLASS-ORDER TRAP
--------------------
The app assumes index 0 = Occupied, index 1 = Open. That invariant is asserted
in tools/export/verify_parity.py, tested in src/lib/detect/postprocess.test.ts,
and stated in comments throughout src/lib/detect/. Getting it backwards would
silently invert every statistic on the site and nothing would throw.

Roboflow orders PKLot's classes alphabetically: ['space-empty', 'space-occupied']
-> index 0 = EMPTY. The opposite of what the app expects.

Rather than flip the app, this script flips the DATASET: it swaps class ids in
every label file and rewrites data.yaml `names` to the exact strings the 2022
checkpoint carried. The resulting best.pt then has identical `names`, every
existing assert passes unchanged, and the new model is a true drop-in.

Idempotent: re-running on an already-remapped dataset is a no-op.
"""
import sys, pathlib, re, collections
import yaml

TARGET = ["Occupied-Parking-Spaces", "Open-Parking-Spaces"]

# How to recognise each class by name, case-insensitive, in whatever the
# source called it.
OCCUPIED_HINTS = ("occupied", "taken", "busy", "full", "car")
OPEN_HINTS = ("empty", "open", "free", "vacant")


def classify(name: str) -> str:
    n = name.lower()
    if any(h in n for h in OCCUPIED_HINTS):
        return "occupied"
    if any(h in n for h in OPEN_HINTS):
        return "open"
    raise SystemExit(f"cannot tell whether class '{name}' is occupied or open — edit the hints")


def main():
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    yml = root / "data.yaml"
    assert yml.exists(), f"no data.yaml in {root}"
    data = yaml.safe_load(yml.read_text())
    names = data["names"]
    if isinstance(names, dict):
        names = [names[i] for i in sorted(names)]
    assert len(names) == 2, f"expected 2 classes, got {names}"
    print(f"[i] source names: {names}")

    if list(names) == TARGET:
        print("[ok] already remapped — nothing to do")
        return

    kinds = [classify(n) for n in names]
    assert sorted(kinds) == ["occupied", "open"], f"could not identify both classes in {names}"

    # mapping: old index -> new index (0 = occupied, 1 = open)
    old_to_new = {i: (0 if k == "occupied" else 1) for i, k in enumerate(kinds)}
    print(f"[i] remap: " + ", ".join(f"{i} ({names[i]}) -> {old_to_new[i]} ({TARGET[old_to_new[i]]})" for i in old_to_new))

    # Label files live wherever data.yaml points; Roboflow uses <split>/labels/.
    label_files = sorted(root.rglob("labels/*.txt"))
    assert label_files, f"no label files found under {root}"

    before = collections.Counter()
    after = collections.Counter()
    for lf in label_files:
        out_lines = []
        for line in lf.read_text().splitlines():
            if not line.strip():
                continue
            parts = line.split()
            old = int(parts[0])
            before[old] += 1
            new = old_to_new[old]
            after[new] += 1
            parts[0] = str(new)
            out_lines.append(" ".join(parts))
        lf.write_text("\n".join(out_lines) + ("\n" if out_lines else ""))

    data["names"] = TARGET
    data["nc"] = 2
    yml.write_text(yaml.safe_dump(data, sort_keys=False))

    print(f"[ok] rewrote {len(label_files)} label files")
    print(f"     before: " + ", ".join(f"{names[i]}={before[i]}" for i in sorted(before)))
    print(f"     after:  " + ", ".join(f"{TARGET[i]}={after[i]}" for i in sorted(after)))
    print(f"[ok] data.yaml names -> {TARGET}")

    # Sanity: in PKLot roughly 60% of labeled spaces are occupied. If 'open'
    # dominates heavily, the hints matched the wrong way round — stop and look.
    occ, opn = after[0], after[1]
    frac = occ / max(1, occ + opn)
    print(f"[i] occupied fraction: {frac:.2%}")
    if frac < 0.3:
        print("[warn] occupied fraction is unusually low for PKLot — double-check the mapping visually")


if __name__ == "__main__":
    main()
