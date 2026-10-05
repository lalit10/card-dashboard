// Card catalog helpers — pure functions over data/card-catalog.json.
//
// A catalog card stores earn rates in *earn units* per dollar (points or %).
// effectivePct() converts to a cash-equivalent % using the catalog's
// cents-per-point valuations (engaged average of floor + optimistic).

export const CATEGORY_LABELS = {
  dining: "Dining",
  groceries: "Groceries",
  travel_flights: "Flights",
  travel_hotels: "Hotels",
  travel_other: "Other travel",
  gas: "Gas",
  transit: "Transit",
  streaming: "Streaming",
  drugstores: "Drugstores",
  online_shopping: "Online shopping",
  entertainment: "Entertainment",
  utilities: "Utilities",
  housing: "Housing",
  rotating: "Rotating",
  choice: "Choice",
  other: "Everything else",
};

export function categoryLabel(key) {
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  return String(key || "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Engaged-average cents per point: (floor + optimistic) / 2. Null if unknown. */
export function cppAvg(card) {
  const { cpp_floor: floor, cpp_optimistic: opt } = card;
  if (typeof floor !== "number" || typeof opt !== "number") return null;
  return (floor + opt) / 2;
}

/**
 * Cash-equivalent earn in percent for one earn entry.
 * Cash cards: rate is already %. Points cards: points/$ × ¢/point = ¢/$ = %.
 * Returns null when it can't be computed.
 */
export function effectivePct(card, entry) {
  if (!entry || typeof entry.rate !== "number") return null;
  if (card.currency_type === "cash") return entry.rate;
  const cpp = cppAvg(card);
  if (cpp === null) return null;
  return entry.rate * cpp;
}

export function formatPct(pct) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "—";
  return (Math.round(pct * 10) / 10).toString().replace(/\.0$/, "") + "%";
}

/** Top n earn entries by effective %, each annotated with pct. */
export function topEarn(card, n = 4) {
  return (card.earn || [])
    .map((e) => ({ ...e, pct: effectivePct(card, e) }))
    .filter((e) => e.pct !== null)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, n);
}

/** One-line signup bonus summary, or null. */
export function bonusSummary(card) {
  const b = card.signup_bonus;
  if (!b || (!b.points && !b.cash_usd)) return null;
  const what = b.points
    ? `${b.points.toLocaleString()} pts`
    : `$${b.cash_usd.toLocaleString()}`;
  const how = b.spend_usd ? ` after $${b.spend_usd.toLocaleString()} spend` : "";
  const when = b.months ? ` in ${b.months} mo` : "";
  return what + how + when;
}

/** Filter cards by free-text query across name, issuer, and earn categories. */
export function searchCatalog(cards, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return cards;
  return cards.filter((c) => {
    const hay = [
      c.name,
      c.issuer,
      c.network,
      ...(c.earn || []).map((e) => e.key),
      ...(c.benefits || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return q.split(/\s+/).every((tok) => hay.includes(tok));
  });
}
