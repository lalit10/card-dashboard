// Citi Merchant Offers adapter.
//
// Verified 2026-10-04 against the live Citi Strata Merchant Offers page:
// clicking an offer opens a detail modal with an "Enroll in Offer" button;
// after enrolling, the modal shows "Expires" and the list re-renders.
// Selectors are best-effort and tried in order — Citi changes its DOM.
// If none match, the run reports 0 unenrolled instead of clicking blindly.

(function () {
  "use strict";
  const D = window.CardCompanionDom;

  const OFFERS_URL = "https://online.citi.com/US/nga/products-offers/merchantoffers";

  const adapter = {
    id: "citi",
    label: "Citi",
    offersUrl: OFFERS_URL,

    matchesPage() {
      return /citi\.com/.test(location.hostname) && D.pageText(/merchant offers/i);
    },

    isSignedIn() {
      if (D.looksLikeLoginPage()) return false;
      return D.pageText(/merchant offers/i);
    },

    isBlocked() {
      if (D.looksLikeCaptcha()) return "captcha";
      // "We are having trouble loading your offers" is transient, not a block.
      return false;
    },

    findUnenrolled() {
      // Unenrolled offers show an enroll affordance; enrolled ones don't.
      const btns = D.findButtons(/enroll in offer|enroll now|^enroll$/i).filter(
        (b) => !/enrolled/i.test(b.innerText || "")
      );
      // Dedupe by nearest offer card container.
      const seen = new Set();
      return btns
        .map((el) => {
          const card = el.closest("[data-offer-id], article, li, div[class*='offer']") || el;
          const key = card.dataset ? card.dataset.offerId || "" : "";
          const label = (card.innerText || "").slice(0, 80);
          const id = key || label;
          if (seen.has(id)) return null;
          seen.add(id);
          return { el, key: id };
        })
        .filter(Boolean);
    },

    async enroll(offer) {
      // Open the offer detail (button itself usually opens the modal).
      offer.el.click();
      const modalBtn = await D.waitFor(
        () => D.findButtons(/enroll in offer/i).find((b) => b !== offer.el) || D.findButtons(/^enroll$/i)[0],
        6000
      );
      if (!modalBtn) return "failed";
      modalBtn.click();
      // Success = modal shows expiry ("Expires …").
      const confirmed = await D.waitFor(() => D.pageText(/expires/i), 8000);
      // Close the modal however it can be closed.
      const close = D.findButtons(/close|done|×/i)[0];
      if (close) close.click();
      else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await new Promise((r) => setTimeout(r, 1200)); // let the list re-render
      return confirmed ? "enrolled" : "failed";
    },
  };

  (window.CardCompanionAdapters = window.CardCompanionAdapters || {})[adapter.id] = adapter;
})();
