// Bank of America adapter.
//
// BankAmeriDeals (regular merchant offers) are AUTO-ACTIVE on eligible cards —
// there is nothing to enroll. Only location-specific "Daily Essentials"
// (gas stations etc.) need a tap, and those expire 4 hours after activation,
// so auto-enrolling them is wrong. This adapter therefore reports "nothing to
// do" for the regular catalog and surfaces nearby Daily Essentials for a
// manual tap instead.

(function () {
  "use strict";
  const D = window.CardCompanionDom;

  const adapter = {
    id: "bofa",
    label: "Bank of America",
    offersUrl: "https://www.bankofamerica.com/",

    matchesPage() {
      return /bankofamerica\.com/.test(location.hostname) && D.pageText(/bankamerideals|deals/i);
    },

    isSignedIn() {
      if (D.looksLikeLoginPage()) return false;
      return D.pageText(/bankamerideals|deals/i);
    },

    isBlocked() {
      if (D.looksLikeCaptcha()) return "captcha";
      return false;
    },

    findUnenrolled() {
      // Regular BankAmeriDeals need no enrollment. Daily Essentials are
      // deliberately left for a manual tap (4-hour expiry, location-bound).
      return [];
    },

    async enroll() {
      return "skipped";
    },

    note: "BankAmeriDeals are auto-active — nothing to enroll. Daily Essentials need a manual tap (they expire 4h after activation).",
  };

  (window.CardCompanionAdapters = window.CardCompanionAdapters || {})[adapter.id] = adapter;
})();
