# legacy/ — the original 2022 ParkWise

This is the AI Camp summer-2022 project, archived. **It is not built, deployed,
or maintained.** It is kept because the before/after is the interesting part of
this repo's history.

The live site is now a Next.js app at the repo root that runs the same model
in the browser. No Python runs in production any more.

## What this was

A Flask app that accepted an image upload, ran a custom YOLOv5s detector
server-side with PyTorch, and rendered a results page. Deployed with
gunicorn + nginx in Docker, originally on AI Camp's CoCalc infrastructure.

Built in roughly three weeks by six high-school students. Forked from the
[`organization-x/omni`](https://github.com/organization-x/omni) teaching
scaffold — which is why the original README described a generic "Computer
Vision Web Scaffold" and never mentioned parking.

## Why it was replaced

- **It could not deploy to Vercel.** Serverless functions cap at 250MB
  unzipped; PyTorch alone exceeds that. The model now runs client-side as
  ONNX, so the site is static and free to host.
- **It threw away the model's output.** Inference produced bounding boxes with
  coordinates and confidences, and the app rendered one sentence
  (*"We found Open-parking-spaces and Occupied-parking-spaces with 87% and 91%
  confidence"*) plus a JPEG with boxes baked in server-side. No counts, no
  occupancy rate, nothing interactive — for a parking tool, the counts are the
  whole point.
- **The video feature never worked** (see below).
- The theme was a purchased BootstrapMade *logistics/trucking* template, still
  carrying its stock truck photography and "AI Camp" branding.

## Known bugs, preserved as-is

Documented rather than fixed, since this is an archive:

- `/beta-video` returns `None` on GET → 500. `'https://you' and '.com' in inp`
  short-circuits so the prefix check does nothing; `inp[-1:-10]` is always the
  empty string; and `uploaded_video()` takes two parameters while its route
  declares one, so it raises `TypeError` on every call.
- `write_video()` is defined inside a per-frame loop, never called, and
  references undefined names (`cv`, `pil_to_cv`).
- Route rules contain literal `?` characters (`/prediction-results?filename=<f>`).
  Flask rules cannot contain query strings, so `url_for` emits `%3F`.
- `len(results.pandas().xyxy) > 0` is always true — `xyxy` is a one-element
  list for a single image. The intended "no detections" branch is unreachable,
  so an empty result renders "We found !".
- `results.save()` uses YOLOv5's `increment_path`, writing to `annotated2`,
  `annotated3`, … while the template always reads `uploads/annotated/`.
- `labels = [emotion.capitalize() for emotion in labels]` — a leftover variable
  name from the scaffold's emotion-detection example.
- `force_reload=True` re-downloaded YOLOv5 from GitHub on every worker start.
- `app.secret_key` was hardcoded in source. Treat it as burned; it is in git
  history and protected nothing.

## What was removed in archiving

The `vendor/` directory (~10.6MB of Bootstrap, Font Awesome, Swiper, jQuery)
and all imagery. The `app/templates/static/` tree — a 73MB duplicate of
`app/static/` that Flask could never serve — is gone entirely.

Everything is recoverable at the tag **`v2022-flask-archive`** or the branch
**`legacy-flask-2022`**:

```bash
git checkout v2022-flask-archive -- <path>
```
