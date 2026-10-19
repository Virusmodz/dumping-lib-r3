#!/bin/bash
# Package the static export for serv00 (Apache on FreeBSD).
# Produces a zip whose contents unpack directly into public_html/.
set -euo pipefail

PROJECT=/home/z/my-project
OUT_DIR="$PROJECT/out"
STAGE="$PROJECT/scripts/serv00-stage"
ZIP="$PROJECT/download/elf-dumper-static-serv00.zip"

# Fresh staging directory
rm -rf "$STAGE"
mkdir -p "$STAGE"

# Copy the static export (index.html at zip root)
cp -r "$OUT_DIR"/. "$STAGE"/

# Apache config — safe on serv00:
#  - AddType is always available (core directives, no AllowOverride risk)
#  - deflate/expires wrapped in <IfModule> so missing modules can't 500
cat > "$STAGE/.htaccess" <<'EOF'
# Dumping LIB R3 — WebAssembly Edition (static export)
# --- MIME types ---
# WebAssembly binary: needed so instantiateStreaming works fast;
# emscripten falls back to arrayBuffer if the type is wrong, but correct is better.
AddType application/wasm .wasm
# ELF shared libraries are served as downloads, never executed.
AddType application/octet-stream .so

# --- Compression (guarded: missing module is ignored, never a 500) ---
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/wasm image/svg+xml
</IfModule>

# --- Caching ---
# _next/static/* and wasm/* are content-hashed / rarely change -> cache long.
# HTML must stay fresh so deploys show up immediately.
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType application/wasm "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 1 year"
  ExpiresDefault "access plus 1 hour"
</IfModule>
EOF

# Build the zip (files at root, .htaccess included)
rm -f "$ZIP"
cd "$STAGE"
zip -r -q "$ZIP" . -x "*.DS_Store"

echo "=== bundle ==="
ls -lh "$ZIP"
echo "=== contents (dirs + key files) ==="
unzip -l "$ZIP" | grep -E "(^Archive|\.htaccess|index\.html|404\.html|robots|wasm/|workers/|sample/|logo)" | head -20
echo "=== file count ==="
unzip -l "$ZIP" | tail -1
