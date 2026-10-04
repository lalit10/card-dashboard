// Chase Offers adapter.
//
// Chase "Offers" section lists offers with an "Add to card" button per tile.
// STATUS: written from the documented flow, NOT yet verified against a live
// Chase session (Chase was bot-blocking automated browsers on 2026-10-04).
// Run it supervised the first time: the popup shows a live progress log.

(function () {
  "use strict";
  const D = window.CardCompanionDom;

  const adapter = {
    id: "chase",
    label: "Chase",
    offersUrl: "https://www.chase.com/",

    matchesPage() {
      return /chase\.com/.test(location.hostname) && D.pageText(/chase offers|my offers/i);
    },

    isSignedIn() {
      if (D.looksLikeLoginPage()) return false;
      return D.pageText(/chase offers|my offers/i);
    },

    isBlocked() {
      if (D.looksLikeCaptcha()) return "captcha";
      if (D.looksLikeSiteError()) return "error";
      return false;
    },

    findUnenrolled() {
      const btns = D.findButtons(/add to card/i);
      const seen = new Set();
      return btns
        .map((el) => {
          const card = el.closest("article, li, div[class*='offer']") || el;
          const label = (card.innerText || "").slice(0, 80);
          if (seen.has(label)) return null;
          seen.add(label);
          return { el, key: label };
        })
        .filter(Boolean);
    },

    async enroll(offer) {
      offer.el.click();
      const done = await D.waitFor(
        () =>
          /added|enrolled/i.test(offer.el.innerText || "") ||
          !offer.el.isConnected ||
          !D.visible(offer.el),
        8000
      );
      return done ? "enrolled" : "failed";
    },
  };

  (window.CardCompanionAdapters = window.CardCompanionAdapters || {})[adapter.id] = adapter;
})();
