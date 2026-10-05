#!/usr/bin/env python3
"""Build data/transfer-partners.json: which points transfer where.

Primary source: card-links-mcp (https://mcp.milesandpointsdaily.com),
free, no auth. Plus a small hand-compiled Marriott Bonvoy supplement
(the endpoint doesn't cover Marriott-as-a-source).

Usage:
    python3 tools/import-transfer-partners.py [--out data/transfer-partners.json]

Transfer ratios are stable facts published by issuers; the script records
per-row provenance so hand-compiled rows are distinguishable from the feed.
"""
import argparse
import json
import sys
import time
import urllib.request

ENDPOINT = "https://mcp.milesandpointsdaily.com/transfer-partners"

# Hand-compiled: Marriott Bonvoy -> airlines. 3:1 almost everywhere, plus
# 5,000 bonus miles per 60,000 points in a single transfer. Well-established
# and stable for years; marked coverage=partial (major partners only).
MARRIOTT_PARTNERS = [
    ("United Airlines", "MileagePlus"),
    ("American Airlines", "AAdvantage"),
    ("Delta Air Lines", "SkyMiles"),
    ("Alaska Airlines", "Atmos Rewards"),
    ("Southwest Airlines", "Rapid Rewards"),
    ("JetBlue", "TrueBlue"),
    ("British Airways", "The British Airways Club"),
    ("Air Canada", "Aeroplan"),
    ("ANA", "Mileage Club"),
    ("Singapore Airlines", "KrisFlyer"),
    ("Cathay Pacific", "Asia Miles"),
    ("Emirates", "Skywards"),
    ("Etihad Airways", "Etihad Guest"),
    ("Qatar Airways", "Privilege Club"),
    ("Virgin Atlantic", "Flying Club"),
    ("Air France/KLM", "Flying Blue"),
    ("Turkish Airlines", "Miles&Smiles"),
    ("Avianca", "LifeMiles"),
    ("Qantas", "Frequent Flyer"),
    ("Korean Air", "SKYPASS"),
]


def parse_ratio(ratio):
    """'1:1' -> 1.0, '3:1' -> 1/3, '1:1.6' -> 1.6, '5:4' -> 0.8."""
    try:
        a, b = ratio.split(":")
        return float(b) / float(a)
    except Exception:  # noqa: BLE001
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/transfer-partners.json")
    args = ap.parse_args()

    req = urllib.request.Request(ENDPOINT, headers={"User-Agent": "card-dashboard/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        feed = json.load(r)

    programs = []
    for p in feed.get("programs", []):
        partners = []
        for pt in p.get("partners", []):
            partners.append({
                "name": pt.get("name"),
                "program": pt.get("program"),
                "currency": pt.get("currency"),
                "type": pt.get("type"),  # airline | hotel
                "ratio": pt.get("ratio"),
                "ratio_value": parse_ratio(pt.get("ratio") or ""),
                "notes": pt.get("notes"),
                "provenance": "mcp.milesandpointsdaily.com",
            })
        programs.append({
            "id": p.get("id"),
            "name": p.get("name"),
            "coverage": "full",
            "partners": sorted(partners, key=lambda x: x["name"] or ""),
        })

    # Marriott supplement (endpoint gap).
    programs.append({
        "id": "marriott-bonvoy",
        "name": "Marriott Bonvoy",
        "coverage": "partial",
        "coverage_note": "Major airline partners only; hand-compiled. 5,000 bonus miles per 60,000 points transferred in one transaction.",
        "partners": sorted([
            {
                "name": name,
                "program": program,
                "currency": None,
                "type": "airline",
                "ratio": "3:1",
                "ratio_value": parse_ratio("3:1"),
                "notes": None,
                "provenance": "hand-compiled",
            }
            for name, program in MARRIOTT_PARTNERS
        ], key=lambda x: x["name"]),
    })

    # Drop empty programs (bank-of-america, yonder have no partners in feed).
    programs = [p for p in programs if p["partners"]]

    out = {
        "source": "mcp.milesandpointsdaily.com + hand-compiled Marriott supplement",
        "source_license_note": "Feed: data license ambiguous (endpoint free, no auth; code MIT). Ratios are issuer-published facts. Verify before transferring.",
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "program_count": len(programs),
        "pair_count": sum(len(p["partners"]) for p in programs),
        "programs": sorted(programs, key=lambda p: p["name"]),
    }
    with open(args.out, "w") as f:
        json.dump(out, f, indent=2)
        f.write("\n")
    print(f"wrote {args.out}: {out['program_count']} programs, {out['pair_count']} pairs", file=sys.stderr)


if __name__ == "__main__":
    main()
