"""
Fallback exporter — bypasses yolov5's export.py CLI plumbing entirely.

Use this if `export.py` dies on an AttributeError from the 2022 checkpoint
(a Detect instance missing an attribute that a newer yolov5 expects).
This does the minimum: unpickle, coerce the Detect head into export mode,
call torch.onnx.export.

  cd tools/export
  .venv/Scripts/python.exe export_min.py --weights ../../models/best.pt --imgsz 416
"""
import argparse, pathlib, sys
import torch

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "yolov5"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", default=str(HERE.parent.parent / "models" / "best.pt"))
    ap.add_argument("--imgsz", type=int, default=416)
    ap.add_argument("--opset", type=int, default=12)
    ap.add_argument("--out", default=None)
    ap.add_argument("--no-simplify", action="store_true")
    args = ap.parse_args()

    from models.yolo import Detect

    # torch<2.6 defaults weights_only=False; pass explicitly so this also works
    # if someone runs it on a newer torch.
    try:
        ckpt = torch.load(args.weights, map_location="cpu", weights_only=False)
    except TypeError:                      # torch too old to know the kwarg
        ckpt = torch.load(args.weights, map_location="cpu")

    model = (ckpt.get("ema") or ckpt["model"]).float()
    model.eval()

    names = model.names
    if isinstance(names, dict):
        names = [names[i] for i in range(len(names))]
    print(f"[i] names: {names}")
    assert list(names) == ["Occupied-Parking-Spaces", "Open-Parking-Spaces"], \
        f"CLASS ORDER CHANGED: {names} (index 0 must be Occupied)"

    # Coerce every module into a shape torch.onnx.export can trace.
    for m in model.modules():
        if isinstance(m, Detect):
            m.inplace = False
            m.export = True
            m.dynamic = False
            if not hasattr(m, "onnx_dynamic"):
                m.onnx_dynamic = False
        if hasattr(m, "inplace"):
            m.inplace = False
        # yolov5<6.2 upsample compat: newer torch chokes on this attribute
        if isinstance(m, torch.nn.Upsample) and not hasattr(m, "recompute_scale_factor"):
            m.recompute_scale_factor = None

    im = torch.zeros(1, 3, args.imgsz, args.imgsz)
    for _ in range(2):          # two warm-up passes settle the grid buffers
        y = model(im)
    shape = tuple(y[0].shape) if isinstance(y, (list, tuple)) else tuple(y.shape)
    print(f"[i] traced output shape: {shape}")

    out = args.out or str(pathlib.Path(args.weights).with_suffix(".onnx"))
    torch.onnx.export(
        model, im, out,
        verbose=False,
        opset_version=args.opset,
        do_constant_folding=True,
        input_names=["images"],
        output_names=["output0"],
        dynamic_axes=None,          # static shapes on purpose
    )
    print(f"[ok] wrote {out}")

    import onnx
    m = onnx.load(out)
    onnx.checker.check_model(m)
    print("[ok] onnx.checker passed")

    if not args.no_simplify:
        try:
            import onnxsim
            m, ok = onnxsim.simplify(m)
            assert ok, "onnxsim reported failure"
            onnx.save(m, out)
            print("[ok] simplified")
        except Exception as e:
            print(f"[warn] simplify skipped: {e}")

    print("\nNow run verify_parity.py against this file.")


if __name__ == "__main__":
    main()
