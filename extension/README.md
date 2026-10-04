# Card Dashboard Companion (browser extension)

The hands to the dashboard's brain. Runs **entirely in your browser** — no
accounts, no servers, no tracking. Your portfolio and offer data never leave
`chrome.storage.local`.

## What it does

1. **Best-card lookup (popup)** — type a merchant, get the recommendation from
   the same `recommend()` engine the dashboard uses. Works on any tab.
2. **Offer auto-enrollment** — on a bank's offers page, the popup probes the
   page (signed in? blocked? how many unenrolled?) and enrolls everything with
   human-like randomized delays. A weekly schedule (default: Sundays 9 AM) does
   this automatically in any bank tab where you're already signed in.
3. **Checkout pill** — optional; on shopping checkout pages it shows a small
   "Use {card}" pill. Needs the `<all_urls>` permission, granted only if you
   enable it.

## Privacy model

- The extension never sees your bank passwords. It only clicks inside pages
  **where you are already signed in**, and it never touches login forms.
- It aborts on CAPTCHAs, bot walls, and site-error pages instead of grinding.
- Enrollment is rate-limited (randomized 1.2–2.8s between clicks, cap 400/run).
- Nothing is sent anywhere: no analytics, no network calls except the bank's
  own pages.

## Bank adapters

Each bank is a small adapter in `content/banks/` implementing
`{ matchesPage, isSignedIn, isBlocked, findUnenrolled, enroll }`, driven by the
shared engine in `content/enroll.js`.

| Bank | Status |
|------|--------|
| Citi | Verified against the live site 2026-10-04 |
| Amex | Written from the documented "Add to Card" flow — verify live |
| Chase | Written from the documented flow — verify live, run supervised first |
| Bank of America | No enrollment needed (BankAmeriDeals are auto-active); Daily Essentials stay manual (4h expiry) |

To add a bank: copy `chase.js`, implement the five methods, register on
`window.CardCompanionAdapters`. Selectors are tried defensively — if none
match, the run reports 0 instead of clicking blindly.

## Shared code

`vendor/recommender.js` and `vendor/util.js` are **copies** of the dashboard's
`js/` modules (Chrome Web Store zips don't follow symlinks). After changing
the dashboard modules, re-run:

```
./tools/sync-shared.sh
```

## Install (developer mode)

1. `chrome://extensions` → enable Developer mode → Load unpacked →
   select the `extension/` folder.
2. Open the extension's Settings (⚙ in the popup), paste your portfolio JSON
   (same shape as the dashboard's `data/sample-portfolio.json`), save.
3. Visit a bank's offers page, click the extension icon → Enroll.

## Files

```
extension/
  manifest.json            MV3 manifest
  popup/                   best-card lookup + per-bank enroll button
  content/enroll.js        shared enrollment engine (rate limits, safety)
  content/banks/           per-bank adapters + DOM helpers
  content/checkout.js      checkout-page recommendation pill (+ CSS)
  background/service-worker.js   weekly alarms, notifications, injection
  options/                 settings: portfolio, banks, schedule, permissions
  vendor/                  synced copies of dashboard js/ modules
```
