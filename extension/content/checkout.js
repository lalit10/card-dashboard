// Checkout overlay — injected on demand by the service worker when the user
// enables "checkout recommendations" (optional host permission).
// Plain script (not a module): it dynamic-imports the vendored recommender.

(async function () {
  "use strict";
  if (window.__ccOverlay) return; // don't double-inject
  window.__ccOverlay = true;

  const CHECKOUT_URL = /\/(checkout|check-?out|cart|basket|payment|pay)(\/|$|\?|#)/i;
  const CHECKOUT_BTN = /place order|complete (order|purchase)|pay now|proceed to checkout|continue to payment/i;

  function looksLikeCheckout() {
    if (CHECKOUT_URL.test(location.pathname + location.search)) return true;
    const btns = Array.from(document.querySelectorAll("button, a, input[type=submit]"));
    return btns.some((b) =>
      CHECKOUT_BTN.test((b.innerText || b.value || b.getAttribute("aria-label") || "").trim())
    );
  }

  function inferMerchant() {
    const meta = document.querySelector("meta[property='og:site_name']");
    if (meta && meta.content) return meta.content.trim();
    let host = location.hostname.replace(/^www\./, "");
    const parts = host.split(".");
    // strip common TLD-ish tails: example.co.uk -> example
    const name = parts.length > 2 ? parts.slice(0, -2).join(".") : parts[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  async function getPortfolio() {
    const { portfolio } = await chrome.storage.local.get("portfolio");
    return portfolio || null;
  }

  if (!looksLikeCheckout()) return;
  const portfolio = await getPortfolio();
  if (!portfolio || !portfolio.categories) return;

  let recommend;
  try {
    ({ recommend } = await import(chrome.runtime.getURL("vendor/recommender.js")));
  } catch (_) {
    return;
  }

  const merchant = inferMerchant();
  const r = recommend({ categories: portfolio.categories, merchant, offers: portfolio.offers || [] });

  // ---- UI: small dismissible pill, bottom-right ----
  const pill = document.createElement("div");
  pill.id = "cc-checkout-pill";
  pill.innerHTML = `
    <button id="cc-pill-close" aria-label="Dismiss">×</button>
    <div class="cc-pill-main">
      <span class="cc-pill-label">Use</span>
      <strong class="cc-pill-card"></strong>
      <span class="cc-pill-sub"></span>
    </div>`;
  pill.querySelector(".cc-pill-card").textContent = r.winner;
  pill.querySelector(".cc-pill-sub").textContent = r.offer
    ? r.offer.summary
    : `${r.category.label} · ${r.rate}`;

  const shadow = document.createElement("div");
  shadow.id = "cc-checkout-root";
  shadow.attachShadow({ mode: "open" }).appendChild(pill);
  document.documentElement.appendChild(shadow);

  // Styles live in checkout-overlay.css, injected as a constructed sheet into the shadow root.
  try {
    const css = await (await fetch(chrome.runtime.getURL("content/checkout-overlay.css"))).text();
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    shadow.shadowRoot.adoptedStyleSheets = [sheet];
  } catch (_) {}

  pill.querySelector("#cc-pill-close").addEventListener("click", () => shadow.remove());
  // Auto-hide after 25s so it never nags.
  setTimeout(() => shadow.remove(), 25000);
})();
