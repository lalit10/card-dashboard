// Card Dashboard — composition root.
//
// Nothing here decides *what* to recommend or *where* data comes from:
//   - data sources live in providers.js (register your own before boot()),
//   - ranking logic lives in recommender.js (swap recommend() to change it),
//   - DOM output lives in render.js.
// This file only wires them together.

import {
  registerPortfolioProvider,
  registerOfferProvider,
  loadPortfolio,
  loadOffers,
  jsonFileProvider,
  queryParamProvider,
  csvOfferProvider,
} from "./providers.js";
import { recommend, DEFAULT_MERCHANT_CATEGORIES } from "./recommender.js";
import {
  setText,
  renderMeta,
  createGuide,
  buildCardFilters,
  renderCards,
  renderLookup,
  renderOfferList,
  offersToText,
  offersToCsv,
} from "./render.js";

// Default provider chain. Your own module can register more providers
// before boot() runs; they are tried in registration order.
registerPortfolioProvider("query param (?portfolio=)", queryParamProvider());
registerPortfolioProvider("local files", jsonFileProvider("my-portfolio.json", "data/sample-portfolio.json"));
registerOfferProvider("csv (?offers=)", csvOfferProvider());

async function boot() {
  const doc = document;

  let data;
  try {
    data = await loadPortfolio();
  } catch (err) {
    setText(doc, "recHeadline", "Could not load portfolio data");
    setText(doc, "recWhy", err && err.message ? err.message : String(err));
    return;
  }

  const cards = data.cards || [];
  const categories = data.categories || [];
  const merchantCategories = data.merchantCategories || DEFAULT_MERCHANT_CATEGORIES;
  let offerNotes = await loadOffers();

  renderMeta(doc, data, cards);

  // ---- spend guide ----
  const guide = createGuide(doc, categories);
  guide.select("dining");

  // ---- card grid ----
  buildCardFilters(doc, cards, (filter) => renderCards(doc, cards, filter));
  renderCards(doc, cards);

  // ---- tabs ----
  const tabs = [...doc.querySelectorAll('[role="tab"]')];
  tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      tabs.forEach((other) => {
        const active = other === tab;
        other.setAttribute("aria-selected", String(active));
        const panel = doc.getElementById(other.getAttribute("aria-controls"));
        if (panel) panel.hidden = !active;
      });
      const topnav = doc.querySelector(".topnav");
      if (topnav && topnav.offsetTop !== undefined)
        window.scrollTo({ top: topnav.offsetTop - 10, behavior: "smooth" });
    })
  );

  // ---- offer note builder ----
  const offerCard = doc.getElementById("offerCard");
  cards.forEach((card) => {
    const option = doc.createElement("option");
    option.value = card.name;
    option.textContent = card.name;
    if (offerCard) offerCard.appendChild(option);
  });

  const offerForm = doc.getElementById("offerForm");
  const offerMessage = doc.getElementById("offerMessage");

  function refreshOffers() {
    renderOfferList(doc, offerNotes, (index) => {
      offerNotes.splice(index, 1);
      refreshOffers();
      setText(doc, "offerMessage", "Offer note removed.");
    });
    // Keep the lookup in sync when notes change.
    renderCurrentLookup();
  }

  if (offerForm)
    offerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const merchant = doc.getElementById("offerMerchant").value.trim();
      const terms = doc.getElementById("offerTerms").value.trim();
      const expiry = doc.getElementById("offerExpiry").value;
      if (!merchant || !terms || !expiry) {
        setText(doc, "offerMessage", "Add the merchant, offer terms, and expiry date.");
        return;
      }
      offerNotes.push({
        card: offerCard ? offerCard.value : "",
        merchant,
        status: doc.getElementById("offerStatus").value,
        terms,
        expiry,
        note: doc.getElementById("offerNote").value.trim(),
      });
      offerForm.reset();
      setText(doc, "offerMessage", "Offer note added. Export before closing this page.");
      refreshOffers();
    });

  const clearOffers = doc.getElementById("clearOffers");
  if (clearOffers)
    clearOffers.addEventListener("click", () => {
      offerNotes = [];
      refreshOffers();
      setText(doc, "offerMessage", "Session notes cleared.");
    });

  const copyOffers = doc.getElementById("copyOffers");
  if (copyOffers)
    copyOffers.addEventListener("click", async () => {
      if (!offerNotes.length) {
        setText(doc, "offerMessage", "Add an offer note first.");
        return;
      }
      try {
        await navigator.clipboard.writeText(offersToText(offerNotes));
        setText(doc, "offerMessage", "Offer notes copied.");
      } catch (_) {
        setText(doc, "offerMessage", "Copy was blocked here. Use Download CSV instead.");
      }
    });

  const downloadOffers = doc.getElementById("downloadOffers");
  if (downloadOffers)
    downloadOffers.addEventListener("click", () => {
      if (!offerNotes.length) {
        setText(doc, "offerMessage", "Add an offer note first.");
        return;
      }
      const blob = new Blob([offersToCsv(offerNotes)], { type: "text/csv;charset=utf-8" });
      const link = doc.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "card-offers-notes.csv";
      doc.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      setText(doc, "offerMessage", "CSV downloaded.");
    });

  // ---- best-card lookup ----
  const lookupForm = doc.getElementById("lookupForm");
  const lookupMerchant = doc.getElementById("lookupMerchant");
  const lookupCategory = doc.getElementById("lookupCategory");
  const lookupClear = doc.getElementById("lookupClear");

  const blankCategory = doc.createElement("option");
  blankCategory.value = "";
  blankCategory.textContent = "Choose a category";
  if (lookupCategory) lookupCategory.appendChild(blankCategory);
  categories.forEach((category) => {
    const option = doc.createElement("option");
    option.value = category.id;
    option.textContent = category.label;
    if (lookupCategory) lookupCategory.appendChild(option);
  });

  function renderCurrentLookup() {
    const merchant = lookupMerchant ? lookupMerchant.value.trim() : "";
    const categoryId = lookupCategory ? lookupCategory.value : "";
    if (!merchant && !categoryId) {
      renderLookup(doc, null);
      return;
    }
    renderLookup(
      doc,
      recommend({ categories, merchant, categoryId, offers: offerNotes, merchantCategories })
    );
  }

  if (lookupForm)
    lookupForm.addEventListener("submit", (event) => {
      event.preventDefault();
      renderCurrentLookup();
    });
  if (lookupClear)
    lookupClear.addEventListener("click", () => {
      if (lookupForm) lookupForm.reset();
      renderCurrentLookup();
      if (lookupMerchant) lookupMerchant.focus();
    });

  refreshOffers();
}

boot();
