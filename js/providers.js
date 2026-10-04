// Data providers — the extension point for "where does dashboard data come from?"
//
// A portfolio provider is any object with:
//   loadPortfolio() -> portfolio object | null   (null = "not this one, try the next")
//
// An offer provider is any object with:
//   loadOffers() -> Array<offer> | null
//
// Offer shape: { card, merchant, status, terms, expiry (YYYY-MM-DD), note }
// Providers are tried in registration order; the first portfolio hit wins,
// offer results are merged and de-duplicated.
//
// To add your own source, call registerPortfolioProvider() / registerOfferProvider()
// from your own module (or a <script type="module"> block) before boot() runs.
// See README.md ("Extending") for examples.

const portfolioProviders = [];
const offerProviders = [];

export function registerPortfolioProvider(name, provider) {
  portfolioProviders.push({ name, provider });
}

export function registerOfferProvider(name, provider) {
  offerProviders.push({ name, provider });
}

export function normalizeOffer(input = {}) {
  return {
    card: input.card || "",
    merchant: input.merchant || "",
    status: input.status || "Activated",
    terms: input.terms || "",
    expiry: input.expiry || "",
    note: input.note || "",
  };
}

export async function loadPortfolio() {
  for (const { name, provider } of portfolioProviders) {
    try {
      const data = await provider.loadPortfolio();
      if (data && Array.isArray(data.cards)) {
        data._source = data._source || name;
        return data;
      }
    } catch (_) {
      /* try the next provider */
    }
  }
  throw new Error(
    "No portfolio data found. Serve this folder over HTTP (e.g. `python3 -m http.server`) " +
      "or deploy it to GitHub Pages, and make sure data/sample-portfolio.json exists."
  );
}

export async function loadOffers() {
  const seen = new Set();
  const merged = [];
  for (const { provider } of offerProviders) {
    try {
      const offers = await provider.loadOffers();
      for (const raw of offers || []) {
        const offer = normalizeOffer(raw);
        const key = [offer.card, offer.merchant, offer.terms, offer.expiry].join("|").toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(offer);
        }
      }
    } catch (_) {
      /* try the next provider */
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Built-in providers
// ---------------------------------------------------------------------------

// Try a list of JSON URLs in order. The default chain keeps private data
// out of the repo: my-portfolio.json (gitignored) wins, sample data is fallback.
export function jsonFileProvider(...urls) {
  return {
    async loadPortfolio() {
      for (const url of urls) {
        try {
          const response = await fetch(url);
          if (response.ok) return await response.json();
        } catch (_) {
          /* try the next URL */
        }
      }
      return null;
    },
  };
}

// Load a portfolio JSON from a URL passed as ?portfolio=<url>.
// Lets anyone share a portfolio by link without forking the repo.
export function queryParamProvider(param = "portfolio") {
  return {
    async loadPortfolio() {
      const url = new URLSearchParams(location.search).get(param);
      if (!url) return null;
      const response = await fetch(url);
      if (!response.ok) return null;
      const data = await response.json();
      data._source = `?${param}=<url>`;
      return data;
    },
  };
}

// Load offer notes from a CSV at ?offers=<csv-url>. Accepts the dashboard's own
// export headers (Card,Merchant,Status,Offer or trigger,Expires,Note) as well as
// the lowercase variant (card,merchant,status,terms,expiry,note / notes).
export function csvOfferProvider(param = "offers") {
  return {
    async loadOffers() {
      const url = new URLSearchParams(location.search).get(param);
      if (!url) return null;
      const response = await fetch(url);
      if (!response.ok) return null;
      return parseOfferCsv(await response.text());
    },
  };
}

// Minimal correct CSV parser (handles quoted fields, embedded commas/quotes,
// CRLF). Returns an array of normalized offers.
export function parseOfferCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((cell) => cell !== "")) rows.push(row);
  if (!rows.length) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const pick = (row, ...names) => {
    for (const name of names) {
      const idx = header.indexOf(name);
      if (idx !== -1 && row[idx] !== undefined) return row[idx].trim();
    }
    return "";
  };
  return rows.slice(1).map((r) =>
    normalizeOffer({
      card: pick(r, "card"),
      merchant: pick(r, "merchant"),
      status: pick(r, "status"),
      terms: pick(r, "terms", "offer or trigger"),
      expiry: pick(r, "expiry", "expires"),
      note: pick(r, "note", "notes"),
    })
  );
}
