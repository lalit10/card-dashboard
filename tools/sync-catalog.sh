#!/bin/bash
# Sync the dashboard's reference data from the card-data repo.
# Our dataset (github.com/lalit10/card-data) is the single source of truth;
# this script pulls its built dist/ files into data/. No conversion, no APIs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="https://raw.githubusercontent.com/lalit10/card-data/main/dist"

curl -sf -m 60 "$BASE/card-catalog.json" -o "$ROOT/data/card-catalog.json"
curl -sf -m 60 "$BASE/transfer-partners.json" -o "$ROOT/data/transfer-partners.json"

python3 -c "
import json
c = json.load(open('$ROOT/data/card-catalog.json'))
t = json.load(open('$ROOT/data/transfer-partners.json'))
print(f\"catalog: {c['card_count']} cards | transfers: {t['pair_count']} pairs | fetched {c['fetched_at'][:10]}\")
"
