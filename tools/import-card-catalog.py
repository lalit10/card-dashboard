#!/usr/bin/env python3
"""Import the rithkott/credit_card_picker card database into card-catalog.json.

Source: https://github.com/rithkott/credit_card_picker (MIT license).
Pinned to a commit ref so refreshes are reproducible; bump REF to update.

Usage:
    python3 tools/import-card-catalog.py [--ref SHA] [--out data/card-catalog.json]

The output follows schemas/catalog.schema.json and is loaded by the
dashboard's catalog provider (js/providers.js) — no build step, just data.
"""
import argparse
import json
import sys
import time
import urllib.request

REPO = "rithkott/credit_card_picker"
DEFAULT_REF = "b7de080ca59bcf39ef86ad329e9c5060596398e6"  # main @ 2026-07-23

HEADERS = {"User-Agent": "card-dashboard-catalog-import/1.0", "Accept": "application/vnd.github+json"}


def gh_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def raw_text(ref, path):
    url = f"https://raw.githubusercontent.com/{REPO}/{ref}/{path}"
    req = urllib.request.Request(url, headers={"User-Agent": HEADERS["User-Agent"]})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")


def convert_card(issuer_dir, card_id, doc, valuations):
    prog = (doc.get("currency") or {}).get("program", "cash")
    val = valuations.get(prog, {})
    fees = doc.get("fees") or {}
    bonus = doc.get("signup_bonus") or {}
    bval = bonus.get("value") or {}

    earn = []
    for e in doc.get("category_rewards") or []:
        cap = e.get("cap") or {}
        earn.append({
            "type": "category",
            "key": e.get("category"),
            "rate": e.get("rate"),
            "cap_usd": cap.get("max_spend_usd"),
            "cap_period": cap.get("period"),
            "portal_only": bool(e.get("portal_only")),
            "notes": (e.get("notes") or "").strip() or None,
        })
    for e in doc.get("merchant_rewards") or []:
        earn.append({
            "type": "merchant",
            "key": e.get("merchant"),
            "rate": e.get("rate"),
            "cap_usd": None,
            "cap_period": None,
            "portal_only": bool(e.get("portal_only")),
            "notes": (e.get("notes") or "").strip() or None,
        })

    credits = []
    for c in doc.get("credits") or []:
        credits.append({
            "name": c.get("name"),
            "amount_usd": c.get("amount_usd"),
            "period": c.get("period"),
            "category": c.get("category"),
            "requires_enrollment": bool(c.get("requires_enrollment")),
            "expires": c.get("expires"),
            "notes": (c.get("notes") or c.get("realistic_capture_rate_note") or "").strip() or None,
        })

    ver = doc.get("verification") or {}
    return {
        "id": f"{issuer_dir}-{card_id}",
        "name": doc.get("name"),
        "issuer": issuer_dir,
        "network": doc.get("network"),
        "availability": doc.get("availability") or "active",
        "annual_fee_usd": fees.get("annual_fee_usd", 0),
        "foreign_transaction_pct": fees.get("foreign_transaction_pct"),
        "currency_type": (doc.get("currency") or {}).get("type"),
        "currency_program": prog,
        "cpp_floor": val.get("floor_cpp"),
        "cpp_optimistic": val.get("optimistic_cpp"),
        "base_rate": doc.get("base_rate"),
        "earn": earn,
        "credits": credits,
        "signup_bonus": {
            "points": bval.get("points"),
            "cash_usd": bval.get("cash_usd") or bval.get("amount_usd"),
            "spend_usd": bonus.get("spend_requirement_usd"),
            "months": bonus.get("window_months"),
            "notes": (bonus.get("notes") or "").strip() or None,
        } if bonus else None,
        "benefits": doc.get("benefit_flags") or [],
        "verified_date": ver.get("last_verified_date"),
        "confidence": ver.get("confidence"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", default=DEFAULT_REF)
    ap.add_argument("--out", default="data/card-catalog.json")
    args = ap.parse_args()

    import yaml  # PyYAML

    print(f"fetching tree @ {args.ref} …", file=sys.stderr)
    tree = gh_json(f"https://api.github.com/repos/{REPO}/git/trees/{args.ref}?recursive=1")["tree"]
    card_paths = [t["path"] for t in tree
                  if t["path"].startswith("data/cards/") and t["path"].endswith(".yaml")]
    print(f"{len(card_paths)} card files", file=sys.stderr)

    valuations = yaml.safe_load(raw_text(args.ref, "data/meta/point-valuations.yaml"))
    # valuations file nests programs under a top-level mapping; normalize
    programs = {}
    def walk(node):
        if isinstance(node, dict):
            if "floor_cpp" in node:
                return node
            for v in node.values():
                r = walk(v)
                if r:
                    return r
        return None
    # simpler: the file is {programs: {...}} or flat; handle both
    if isinstance(valuations, dict):
        for k, v in valuations.items():
            if isinstance(v, dict) and "floor_cpp" in v:
                programs[k] = v
        # one level deeper
        if not programs:
            for v in valuations.values():
                if isinstance(v, dict):
                    for k2, v2 in v.items():
                        if isinstance(v2, dict) and "floor_cpp" in v2:
                            programs[k2] = v2

    cards = []
    for i, path in enumerate(sorted(card_paths)):
        parts = path.split("/")
        issuer_dir, filename = parts[2], parts[3]
        card_id = filename[:-5]
        try:
            doc = yaml.safe_load(raw_text(args.ref, path))
            cards.append(convert_card(issuer_dir, card_id, doc, programs))
        except Exception as e:  # noqa: BLE001 — report and keep going
            print(f"SKIP {path}: {e}", file=sys.stderr)
        if (i + 1) % 25 == 0:
            print(f"  …{i + 1}/{len(card_paths)}", file=sys.stderr)
        time.sleep(0.05)  # be polite to raw.githubusercontent.com

    catalog = {
        "source": f"github.com/{REPO}",
        "source_ref": args.ref,
        "source_license": "MIT",
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "card_count": len(cards),
        "valuations": {k: {"floor_cpp": v.get("floor_cpp"), "optimistic_cpp": v.get("optimistic_cpp"),
                            "label": v.get("label")} for k, v in programs.items()},
        "cards": sorted(cards, key=lambda c: c["name"] or c["id"]),
    }
    with open(args.out, "w") as f:
        json.dump(catalog, f, indent=2)
        f.write("\n")
    print(f"wrote {args.out}: {len(cards)} cards", file=sys.stderr)


if __name__ == "__main__":
    main()
