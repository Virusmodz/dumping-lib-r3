#!/bin/bash
# Build script: compiles the Dumping LIB R3 C++ core to WebAssembly with Emscripten
set -e

source /home/z/emsdk/emsdk_env.sh 2>/dev/null

SRC=/home/z/my-project/wasm-src
OUT=/home/z/my-project/public/wasm

mkdir -p "$OUT"

echo "[1/2] Compiling C++ -> WebAssembly ..."
em++ "$SRC/dumper_wasm.cpp" \
     -I"$SRC" \
     -O3 \
     -std=c++17 \
     -fexceptions \
     --no-entry \
     -s WASM=1 \
     -s ALLOW_MEMORY_GROWTH=1 \
     -s INITIAL_MEMORY=64MB \
     -s MAXIMUM_MEMORY=2GB \
     -s MODULARIZE=1 \
     -s EXPORT_NAME=ElfDumperModule \
     -s ENVIRONMENT=web,worker \
     -s EXPORTED_FUNCTIONS=_malloc,_free,_wasm_analyze,_wasm_get_dump,_wasm_get_json,_wasm_get_error,_wasm_get_version \
     -s EXPORTED_RUNTIME_METHODS=UTF8ToString,HEAPU8,ccall,cwrap \
     -o "$OUT/elf-dumper.js"

echo "[2/2] Output:"
ls -lh "$OUT"
