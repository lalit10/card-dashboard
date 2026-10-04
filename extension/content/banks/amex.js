// Amex Offers adapter.
//
// Amex "Offers" tab lists eligible offers each with an "Add to Card" button;
// enrolled offers move to the "Enrolled" tab. Selectors are best-effort —
// verify against the live page before trusting a full auto-run.

(function () {
  "use strict";
  const D = window.CardCompanionDom;

  const adapter = {
    id: "amex",
    label: "Amex",
    offersUrl: "https://online.americanexpress.com/myca/offers/",

    matchesPage() {
      return /americanexpress\.com/.test(location.hostname) && D.pageText(/amex offers|offers for you/i);
    },

    isSignedIn() {
      if (D.looksLikeLoginPage()) return false;
      return D.pageText(/amex offers|offers for you/i);
    },

    isBlocked() {
      if (D.looksLikeCaptcha()) return "captcha";
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
      // The button usually flips to "Added to Card" / moves the tile.
      const done = await D.waitFor(
        () =>
          /added to card|enrolled/i.test(offer.el.innerText || "") ||
          !offer.el.isConnected ||
          !D.visible(offer.el),
        8000
      );
      return done ? "enrolled" : "failed";
    },
  };

  (window.CardCompanionAdapters = window.CardCompanionAdapters || {})[adapter.id] = adapter;
})();
