// Shared DOM helpers for bank adapters. Loaded before the bank files.
// Keep selectors defensive: bank DOMs change, so adapters try several
// strategies and bail out loudly instead of clicking blindly.

(function () {
  "use strict";

  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const visible = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };

  // Buttons/links whose visible text matches rx (case-insensitive string or RegExp).
  const findButtons = (rx, root = document) => {
    const re = rx instanceof RegExp ? rx : new RegExp(rx, "i");
    return $$("button, a, [role='button'], input[type='button'], input[type='submit']", root).filter(
      (el) => visible(el) && re.test((el.innerText || el.value || el.getAttribute("aria-label") || "").trim())
    );
  };

  const pageText = (rx) => {
    const re = rx instanceof RegExp ? rx : new RegExp(rx, "i");
    return re.test(document.body ? document.body.innerText : "");
  };

  // Poll until fn() returns truthy or timeout. Returns the value or null.
  const waitFor = async (fn, timeoutMs = 8000, intervalMs = 250) => {
    const end = Date.now() + timeoutMs;
    for (;;) {
      let v = null;
      try {
        v = fn();
      } catch (_) {}
      if (v) return v;
      if (Date.now() > end) return null;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  };

  const looksLikeLoginPage = () =>
    pageText(/sign (on|in)/) &&
    !!document.querySelector("input[type='password']") &&
    !pageText(/merchant offers|my offers|offers for you/i);

  const looksLikeCaptcha = () =>
    pageText(/captcha|verify you are human|unusual traffic|are you a robot|access denied|perimeterx|datadome/i);

  const looksLikeSiteError = () =>
    pageText(/this part of our site isn('|’)t working|something went wrong|service unavailable|try again later/i);

  window.CardCompanionDom = {
    $$,
    visible,
    findButtons,
    pageText,
    waitFor,
    looksLikeLoginPage,
    looksLikeCaptcha,
    looksLikeSiteError,
  };
})();
