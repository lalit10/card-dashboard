#!/bin/bash
# Copy the shared dashboard modules into the extension's vendor/ directory.
# The extension ships these as vendored copies (Chrome Web Store zips don't
# follow symlinks). Re-run after changing js/recommender.js or js/util.js.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/extension/vendor"
for f in recommender.js util.js; do
  cp "$ROOT/js/$f" "$ROOT/extension/vendor/$f"
done
echo "synced: $(ls "$ROOT/extension/vendor")"
