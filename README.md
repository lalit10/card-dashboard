# Card Dashboard

A static, privacy-first dashboard that answers one question: **which of my credit cards should I use for this purchase?**

- **Spend guide** — pick a spending category, get the best card, the earn rate, and runner-ups.
- **Best Card to Use** — type a merchant and/or pick a category; the lookup recommends the top card and shows alternatives. Notes you save in *Offers notes* (e.g. an activated bank offer for that merchant) automatically override the base recommendation.
- **All cards** — your full portfolio with earn rates, fees, and tags, filterable by job (travel, cash back, premium, rotating).
- **Benefits** — monthly, semiannual, and annual credit reminders so use-it-or-lose-it perks don't expire unused.
- **Offers notes** — a session-only note builder for card-linked merchant offers (merchant, terms, expiry). Export to CSV or copy the list.

Ships with **fictional sample data** so you can see the whole thing working immediately.

## Privacy by design

- Fully static: one HTML page, one stylesheet, one script. No backend, no database, no accounts.
- No analytics, no cookies, no network calls except loading the local data JSON file.
- Offer notes live only in the current browser session and are cleared when you close the page — nothing you type ever leaves your machine.
- Your real portfolio goes in `my-portfolio.json`, which is **gitignored**. Never commit it.

## Quick start

```bash
# serve the folder (fetch() of the JSON file needs http, not file://)
python3 -m http.server 8000
# open http://localhost:8000
```

Or deploy to GitHub Pages: push the repo, then **Settings → Pages → Deploy from branch → main → /** — the site is live at `https://<you>.github.io/<repo>/`.

## Architecture

No build step — the app is ES modules loaded straight from `index.html`
(`<script type="module" src="js/main.js">`). Serve over HTTP (modules are
blocked on `file://`) or deploy to GitHub Pages as-is.

```
index.html                  shell + tab panels
css/styles.css              all styling (CSS custom properties for theming)
js/main.js                  composition root: registers providers, boots, wires events
js/providers.js             data-source plugins (portfolio + offers)
js/recommender.js           pure recommendation engine (no DOM)
js/render.js                DOM rendering (takes `doc`, defaults to document)
js/util.js                  small shared helpers
data/sample-portfolio.json  fictional data shipped with the repo
schemas/                    JSON Schemas for the portfolio and offer formats
```

Seams for extension:

- **Data sources** — `js/providers.js`. A portfolio provider is `{ loadPortfolio() }`,
  an offer provider is `{ loadOffers() }`. Built-ins: local JSON files
  (`my-portfolio.json` → `data/sample-portfolio.json`), `?portfolio=<url>`,
  and `?offers=<csv-url>` (dashboard CSV format).
- **Ranking logic** — `js/recommender.js`. `recommend({ categories, merchant, categoryId, offers, merchantCategories, now })`
  is pure: same input, same output, no DOM. Swap it to change how winners are picked.
- **Views** — `js/render.js`. Every function takes `doc` first, so views are unit-testable.
- **Data shapes** — `schemas/portfolio.schema.json`, `schemas/offers.schema.json`.

## Browser extension

`extension/` holds **Card Dashboard Companion** (Manifest V3) — the hands to
the dashboard's brain: best-card lookup popup, bank-offer auto-enrollment
(Citi verified live; Amex/Chase from documented flows), a weekly enrollment
schedule, and an optional checkout-page recommendation pill. Same
`recommend()` engine, vendored via `tools/sync-shared.sh`. Fully local: no
accounts, no servers, never touches login forms. See `extension/README.md`.
Load unpacked from `chrome://extensions` in developer mode.

## Extending

**Add a data source.** Create `js/my-provider.js`:

```js
import { registerPortfolioProvider } from "./providers.js";

registerPortfolioProvider("my source", {
  async loadPortfolio() {
    // return a portfolio object, or null to let the next provider try
    return null;
  },
});
```

then import it from `js/main.js` before `boot()`. Offer sources work the same
with `registerOfferProvider(name, { loadOffers() })` — return rows shaped like
`{ card, merchant, status, terms, expiry: "YYYY-MM-DD", note }`.

**Swap the recommender.** Replace `recommend()` in `js/recommender.js` (or import
your own in `js/main.js`). Keep the signature: it receives
`{ categories, merchant, categoryId, offers, merchantCategories, now }` and
returns `{ category, offer, winner, rate, runners, inferred, merchant }`.

**Share a portfolio by link.** Host a portfolio JSON anywhere and open
`?portfolio=<url>` — no fork needed. Pair with `?offers=<csv-url>` to preload
offer notes from a CSV in the dashboard's export format.

## Make it yours

1. Copy the sample data to your private file:
   ```bash
   cp data/sample-portfolio.json my-portfolio.json
   ```
2. Edit `my-portfolio.json` — replace the sample cards, categories, credits, and offers with your own.
3. Reload the page. The app prefers `my-portfolio.json` and falls back to the sample when it's absent.

### Data schema

```jsonc
{
  "meta": {
    "eyebrow": "Wallet playbook",          // hero kicker
    "lastUpdated": "Sep 2026",             // shown next to the kicker
    "heroHeading": "Pick the right card before you tap.",
    "heroCopy": "…",
    "totalFees": "$590",                   // snapshot: listed annual fees
    "feesNote": "Across two fee-bearing cards",
    "monthlyTotal": "$13",                 // snapshot + benefits total
    "monthlyTotalLabel": "possible this month*",
    "cardsHeading": "Your {n}-card lineup", // {n} is replaced with the card count
    "benefitsHeading": "Credit check",
    "sourcesNote": "…",                    // assumptions / research date
    "monthlyFinePrint": "…"
  },
  "cards": [
    {
      "name": "Example Travel Card", "issuer": "Example Bank", "fee": "$95/yr",
      "color": "#2d77a9",                    // accent swatch
      "filters": ["travel", "everyday"],     // any values; travel|cash|premium|rotating sort first, others get auto buttons
      "role": "Everyday travel earner",
      "earns": [["Flights + hotels direct", "3X"], ["Everything else", "1X"]],
      "tags": ["No foreign transaction fee"]
    }
  ],
  "categories": [
    {
      "id": "dining",                        // 'dining' is the default view; 'other' is the fallback
      "label": "Dining", "card": "Example Travel Card", "rate": "3X",
      "rateNote": "points at restaurants worldwide", "bg": "#9a6d12",
      "headline": "Dining goes on the travel card",
      "why": "Why this card wins for this category.",
      "alts": [["Runner-up Card", "2X", "short note"]],
      "alert": ["Value lens matters", "Points are not automatically cash — value depends on redemption."]
    }
  ],
  "merchantCategories": [                    // merchant → category inference for the lookup
    { "terms": ["restaurant", "cafe"], "category": "dining" }
  ],
  "monthlyCredits": [
    { "card": "Example Card", "label": "Dining credit",
      "detail": "Eligible purchases; enrollment required.", "amount": "$10/mo" }
  ],
  "periodCredits": [
    { "group": "Annual / anniversary",
      "items": [{ "when": "EXAMPLE CARD", "title": "$300 travel credit",
                  "detail": "Automatic on qualifying travel." }] }
  ],
  "offerPrograms": [                         // where to check for offers, by issuer program
    { "program": "Example Offers", "color": "#c8a54a", "cards": ["Example Travel Card"] }
  ],
  "walletRules": [                           // the small rule tiles under the spend guide
    { "rate": "2%", "label": "cash-back floor" }
  ],
  "sources": ["Example issuer product pages"]
}
```

Notes:

- Every card name referenced in `categories` (including `alts`) should match a `name` in `cards` — that's how the lookup and offer-card dropdown stay consistent.
- Keep a category with `id: "other"`; the lookup uses it when nothing else matches.
- Verify issuer terms yourself before trusting any rate — this dashboard is a snapshot, not live data.

## Screenshots

> TODO: add screenshots — e.g. `docs/screenshot-spend-guide.png`, `docs/screenshot-best-card.png`, `docs/screenshot-benefits.png` — and reference them here.

## Contributing

Issues and PRs welcome. If you add a feature, keep it data-driven (no hardcoded card names or dollar amounts in `index.html` / `js/`) and keep the privacy story intact: no backends, no tracking, no third-party requests.

## License

MIT — see [LICENSE](LICENSE).
