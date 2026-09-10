/**
 * Copy onnxruntime-web's WASM binaries into public/ort/.
 *
 * Next does not emit files out of node_modules, and pointing ort at a CDN is
 * worse: version skew against the installed package, broken offline dev, and it
 * fights the COEP header in next.config.ts. So we self-host, and the worker
 * sets `ort.env.wasm.wasmPaths = '/ort/'`.
 *
 * Wired to BOTH predev and prebuild — prebuild alone would leave `next dev`
 * without the binaries.
 */
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const dest = join(root, 'public', 'ort');

if (!existsSync(src)) {
  console.error('[ort] onnxruntime-web not installed; run npm install first.');
  process.exit(1);
}

mkdirSync(dest, { recursive: true });

// Only what the browser actually fetches at runtime. The full dist is ~25MB;
// this keeps public/ort/ closer to ~12MB. `.mjs` files are the loader glue that
// sits beside each `.wasm` — both are required.
const WANTED = /^ort-wasm.*\.(wasm|mjs)$/;

let copied = 0;
let bytes = 0;
for (const name of readdirSync(src)) {
  if (!WANTED.test(name)) continue;
  const from = join(src, name);
  copyFileSync(from, join(dest, name));
  bytes += statSync(from).size;
  copied++;
}

if (copied === 0) {
  console.error('[ort] no ort-wasm* files found in', src);
  process.exit(1);
}

console.log(`[ort] copied ${copied} files (${(bytes / 1e6).toFixed(1)}MB) -> public/ort/`);
