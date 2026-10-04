// Recommendation engine. 100% pure: no DOM, no fetch, no dates from the
// environment except via the `now` argument. This is the module to swap if
// you want different ranking logic (points valuations, fee amortization,
// 5/24 awareness, ...): keep the `recommend()` signature and the UI keeps
// working. See README.md ("Extending").

export const DEFAULT_MERCHANT_CATEGORIES = [
  { terms: ["alaska airlines", "hawaiian airlines"], category: "alaska" },
  {
    terms: [
      "doordash", "grubhub", "seamless", "five guys", "cheesecake factory",
      "buffalo wild wings", "wonder", "resy", "restaurant", "cafe", "coffee",
    ],
    category: "dining",
  },
  { terms: ["uber eats"], category: "dining" },
  { terms: ["uber", "lyft", "bart", "caltrain", "amtrak", "parking", "toll"], category: "transit" },
  { terms: ["shell", "chevron", "exxon", "mobil", "chargepoint", "electrify america"], category: "gas" },
  {
    terms: ["netflix", "spotify", "hulu", "disney+", "disney plus", "youtube tv", "max", "peacock"],
    category: "streaming",
  },
  { terms: ["cvs", "walgreens", "rite aid", "pharmacy"], category: "drugstores" },
  { terms: ["verizon", "t-mobile", "at&t", "comcast mobile", "mint mobile"], category: "phone" },
  { terms: ["safeway", "whole foods", "trader joe", "sprouts", "grocery", "supermarket"], category: "groceries" },
  {
    terms: ["united", "delta", "american airlines", "marriott", "hilton", "hyatt", "ihg", "hotel", "airline"],
    category: "travel",
  },
  { terms: ["costco", "walmart", "target", "amazon"], category: "other" },
];

// Guess a category id from a merchant name via substring matching.
export function inferCategory(merchant, merchantCategories = DEFAULT_MERCHANT_CATEGORIES) {
  const normalized = String(merchant || "").toLowerCase().trim();
  const match = (merchantCategories || []).find((group) =>
    (group.terms || []).some((term) => normalized.includes(String(term).toLowerCase()))
  );
  return match ? match.category : "other";
}

// Offers that are activated, unexpired, and name-match the merchant.
// Name matching is substring both ways ("shell" matches "Shell Gas").
export function activeMatchingOffers(offers, merchant, now = new Date()) {
  const normalized = String(merchant || "").toLowerCase().trim();
  if (!normalized) return [];
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return (offers || [])
    .filter((offer) => {
      const saved = String(offer.merchant || "").toLowerCase().trim();
      const matches = normalized.includes(saved) || saved.includes(normalized);
      const expiry = new Date(`${offer.expiry}T23:59:59`);
      return matches && offer.status === "Activated" && !Number.isNaN(expiry.getTime()) && expiry >= today;
    })
    .sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)));
}

function categoryById(categories, id) {
  return (
    categories.find((category) => category.id === id) ||
    categories.find((category) => category.id === "other") ||
    categories[0]
  );
}

// The single entry point the UI calls.
//
// Input:  { categories, merchant, categoryId, offers, merchantCategories, now }
// Output: { category, offer, winner, rate, runners, inferred, merchant }
//
// An activated, unexpired, name-matching offer always beats the base earn
// recommendation; otherwise the category's published pick wins.
export function recommend({
  categories = [],
  merchant = "",
  categoryId = "",
  offers = [],
  merchantCategories = DEFAULT_MERCHANT_CATEGORIES,
  now = new Date(),
} = {}) {
  const cleanMerchant = String(merchant || "").trim();
  const chosenId = categoryId || (cleanMerchant ? inferCategory(cleanMerchant, merchantCategories) : "");
  const category = categoryById(categories, chosenId || "other");
  const hits = activeMatchingOffers(offers, cleanMerchant, now);
  const offer = hits[0] || null;

  const winner = offer ? offer.card : category.card;
  const rate = offer ? "OFFER" : category.rate;

  let runners = (category.alts || []).slice();
  if (offer && category.card !== winner) {
    runners = [
      [category.card, category.rate, `Best base earn for ${category.label.toLowerCase()}`],
      ...runners,
    ].filter((row, index, array) => array.findIndex((other) => other[0] === row[0]) === index);
  }
  runners = runners.filter((row) => row[0] !== winner).slice(0, 3);

  return {
    category,
    offer,
    winner,
    rate,
    runners,
    inferred: !categoryId && !!cleanMerchant,
    merchant: cleanMerchant,
  };
}
