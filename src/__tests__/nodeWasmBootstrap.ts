/**
 * Node-only bootstrap for the `wasm-engine` package.
 *
 * Background:
 *   `wasm-engine/pkg/wasm_engine.js` is the **web** target produced by
 *   `wasm-pack`. Its default export (`__wbg_init`) lazy-loads the `.wasm`
 *   binary by calling `fetch(new URL('wasm_engine_bg.wasm', import.meta.url))`.
 *
 *   Under Node + tsx (no Vite, no browser), `fetch()` exists but does not
 *   accept `file://` URLs, so the call rejects with a TypeError that the
 *   engine's `try { await initWasm() } catch (_) {}` swallows. The internal
 *   `wasm` binding is then `undefined` and the very first call into
 *   `run_mc_simulation` blows up with:
 *     TypeError: Cannot read properties of undefined (reading '__wbindgen_free')
 *
 * Solution:
 *   Read the `.wasm` file from disk synchronously and pre-initialize the
 *   module via the package's `initSync()` export. After this runs once,
 *   `await __wbg_init()` is a no-op (it short-circuits when `wasm !==
 *   undefined`).
 *
 *   Browser builds are unaffected: nothing under `src/` outside
 *   `__tests__/` imports this helper.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
// `initSync` and the `__wbg_init` default export are both surfaced by the
// web build. We resolve the `.wasm` file relative to the package's JS
// entry rather than hard-coding a path, so this keeps working if the
// `wasm-engine/pkg` layout shifts.
import * as wasmEngine from 'wasm-engine';

let initialized = false;

export async function ensureWasmInitialized(): Promise<void> {
  if (initialized) return;

  // Resolve the .wasm next to the package's compiled JS module.
  // `import.meta.resolve` would be cleaner but is gated by Node flags;
  // `require.resolve`-style discovery via the `wasm-engine` package
  // root is unavailable from an ESM context, so we navigate from this
  // file's directory up to the repo root and into wasm-engine/pkg.
  const here = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(here), '..', '..');
  const wasmPath = path.join(repoRoot, 'wasm-engine', 'pkg', 'wasm_engine_bg.wasm');

  const bytes = readFileSync(wasmPath);
  const initSync = (wasmEngine as unknown as {
    initSync: (input: { module: BufferSource } | BufferSource) => unknown;
  }).initSync;
  if (typeof initSync !== 'function') {
    throw new Error(
      'wasm-engine: initSync() not exported by the resolved package; ' +
        'cannot bootstrap from Node without a browser fetch().'
    );
  }
  // Newer wasm-bindgen builds accept `{ module: BufferSource }`; the older
  // signature accepted a bare BufferSource. Try the structured form first
  // and fall back to the bare-bytes form.
  try {
    initSync({ module: bytes });
  } catch {
    initSync(bytes);
  }

  initialized = true;
}
