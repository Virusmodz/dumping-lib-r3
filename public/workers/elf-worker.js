// -----------------------------------------------------------------------------
// ELF Dumper — Web Worker
// Runs the Emscripten/WASM analysis off the main thread so that huge
// libraries (200MB+ .so files) never freeze the UI.
//
// Protocol:
//   main -> { type: 'init' }
//   main <- { type: 'ready', version } | { type: 'init-error', error }
//   main -> { type: 'analyze', id, fileName, buffer }   (buffer is transferred)
//   main <- { type: 'result', id, fileName, fileSize, rc, json, dump, error,
//             durationMs }
// -----------------------------------------------------------------------------
'use strict';

let modulePromise = null;

// Derive the site base path from this worker's own URL so the worker works
// both at the domain root (serv00, user sites) and under a sub-path
// (GitHub Pages project sites: https://<user>.github.io/<repo>/).
// Example: /my-repo/workers/elf-worker.js -> '/my-repo'
const BASE_PATH = self.location.pathname.replace(/\/workers\/elf-worker\.js$/, '');

function getModule() {
  if (!modulePromise) {
    importScripts(BASE_PATH + '/wasm/elf-dumper.js');
    modulePromise = self.ElfDumperModule({
      locateFile: (p) => (p.startsWith('/') ? p : BASE_PATH + '/wasm/' + p),
    });
  }
  return modulePromise;
}

/** Write a JS string into the wasm heap as a NUL-terminated C string. */
function writeCString(mod, s) {
  const bytes = new TextEncoder().encode(String(s || ''));
  const ptr = mod._malloc(bytes.length + 1);
  if (!ptr) throw new Error('Out of memory allocating the filename buffer');
  mod.HEAPU8.set(bytes, ptr);
  mod.HEAPU8[ptr + bytes.length] = 0;
  return ptr;
}

async function handleAnalyze(msg) {
  const mod = await getModule();
  const bytes = new Uint8Array(msg.buffer);
  const t0 = Date.now();
  const fileSize = bytes.length;

  const ptr = mod._malloc(fileSize);
  if (!ptr) throw new Error('Out of memory allocating the wasm buffer');
  const namePtr = writeCString(mod, msg.fileName);
  try {
    mod.HEAPU8.set(bytes, ptr);
    const rc = mod._wasm_analyze(ptr, fileSize, namePtr);
    const json = rc === 0 ? mod.UTF8ToString(mod._wasm_get_json()) : '';
    const dump = rc === 0 ? mod.UTF8ToString(mod._wasm_get_dump()) : '';
    const error = rc !== 0 ? mod.UTF8ToString(mod._wasm_get_error()) : '';
    return {
      type: 'result',
      id: msg.id,
      fileName: msg.fileName,
      fileSize,
      rc,
      json,
      dump,
      error,
      durationMs: Date.now() - t0,
    };
  } finally {
    mod._free(namePtr);
    mod._free(ptr);
  }
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'init') {
    try {
      const mod = await getModule();
      self.postMessage({
        type: 'ready',
        version: mod.UTF8ToString(mod._wasm_get_version()),
      });
    } catch (err) {
      self.postMessage({
        type: 'init-error',
        error: String((err && err.message) || err),
      });
    }
    return;
  }

  if (msg.type === 'analyze') {
    try {
      self.postMessage(await handleAnalyze(msg));
    } catch (err) {
      self.postMessage({
        type: 'result',
        id: msg.id,
        fileName: msg.fileName,
        fileSize: 0,
        rc: 4,
        json: '',
        dump: '',
        error: String((err && err.message) || err),
        durationMs: 0,
      });
    }
  }
};
