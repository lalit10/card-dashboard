// DOM rendering. Every function takes `doc` (default: the global document)
// so views stay decoupled from data and logic. No fetching, no decisions
// about *what* to recommend — that lives in recommender.js.

import { escapeHtml } from "./util.js";
import { topEarn, formatPct, categoryLabel, bonusSummary, searchCatalog } from "./catalog.js";
import { programOptions, partnersFor, sourcesFor } from "./transfers.js";

export function setText(doc, id, text) {
  const el = doc.getElementById(id);
  if (el) el.textContent = text;
}

// ---- portfolio meta / snapshot -------------------------------------------

export function renderMeta(doc, data, cards) {
  const meta = data.meta || {};
  setText(doc, "heroEyebrow", [meta.eyebrow, meta.lastUpdated].filter(Boolean).join(" · "));
  setText(doc, "page-heading", meta.heroHeading);
  setText(doc, "heroCopy", meta.heroCopy);
  setText(doc, "snapshotFees", meta.totalFees);
  setText(doc, "snapshotFeesNote", meta.feesNote);
  setText(doc, "snapshotCardCount", String(cards.length));
  setText(doc, "snapshotMonthly", meta.monthlyTotal);
  setText(doc, "cardsHeading", (meta.cardsHeading || "Your {n}-card lineup").replace("{n}", String(cards.length)));
  setText(doc, "benefitsHeading", meta.benefitsHeading);
  setText(doc, "monthlyTotalValue", meta.monthlyTotal);
  setText(doc, "monthlyTotalLabel", meta.monthlyTotalLabel);

  const mc = doc.getElementById("monthlyCredits");
  if (mc)
    mc.innerHTML = (data.monthlyCredits || [])
      .map(
        (c) =>
          `<li class="benefit-item"><div><strong>${escapeHtml(c.card)} · ${escapeHtml(c.label)}</strong><p>${escapeHtml(c.detail)}</p></div><span class="amount">${escapeHtml(c.amount)}</span></li>`
      )
      .join("");

  const pg = doc.getElementById("periodGroups");
  if (pg)
    pg.innerHTML = (data.periodCredits || [])
      .map(
        (g) =>
          `<div class="period-group"><h3>${escapeHtml(g.group)}</h3>${(g.items || [])
            .map(
              (i) =>
                `<div class="period-card"><span class="when">${escapeHtml(i.when)}</span><strong>${escapeHtml(i.title)}</strong><p>${escapeHtml(i.detail)}</p></div>`
            )
            .join("")}</div>`
      )
      .join("");

  const op = doc.getElementById("offerPrograms");
  if (op)
    op.innerHTML = (data.offerPrograms || [])
      .map(
        (p) =>
          `<div class="issuer-row" style="--issuer-color:${escapeHtml(p.color || "#666")}"><span class="issuer-dot"></span><div><strong>${escapeHtml(p.program)}</strong><span>${escapeHtml((p.cards || []).join(" · "))}</span></div></div>`
      )
      .join("");

  const sg = doc.getElementById("sourceGrid");
  if (sg) sg.innerHTML = (data.sources || []).map((s) => `<span>${escapeHtml(s)}</span>`).join("");

  setText(doc, "sourcesNote", meta.sourcesNote);
  setText(doc, "monthlyFinePrint", meta.monthlyFinePrint);

  const wr = doc.getElementById("walletRules");
  if (wr)
    wr.innerHTML = (data.walletRules || [])
      .map(
        (r) =>
          `<div class="ledger-cell"><strong>${escapeHtml(r.rate)}</strong><span>${escapeHtml(r.label)}</span></div>`
      )
      .join("");

  setText(
    doc,
    "dataSourceNote",
    `Portfolio data: ${data._source || "unknown"}. To use your own cards, copy data/sample-portfolio.json to my-portfolio.json in the repo root and edit it — my-portfolio.json is gitignored and never committed.`
  );
}

// ---- spend guide ----------------------------------------------------------

export function createGuide(doc, categories) {
  const strip = doc.getElementById("categoryStrip");

  function select(id) {
    const item = categories.find((c) => c.id === id) || categories[0];
    if (!item) return;
    doc.querySelectorAll(".chip").forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.id === item.id)));
    const recCard = doc.getElementById("recCard");
    const recCategory = doc.getElementById("recCategory");
    const recName = doc.getElementById("recName");
    const recRate = doc.getElementById("recRate");
    if (recCard) recCard.style.setProperty("--rec-bg", item.bg);
    if (recCategory) recCategory.textContent = item.label;
    if (recName) recName.textContent = item.card;
    if (recRate && recRate.firstChild) recRate.firstChild.nodeValue = item.rate;
    setText(doc, "recRateNote", item.rateNote);
    setText(doc, "recHeadline", item.headline);
    setText(doc, "recWhy", item.why);
    setText(doc, "alertTitle", item.alert ? item.alert[0] : "");
    setText(doc, "alertCopy", item.alert ? item.alert[1] : "");
    const recAlternates = doc.getElementById("recAlternates");
    if (recAlternates)
      recAlternates.innerHTML = (item.alts || [])
        .map(
          (alt, index) => `
        <div class="alt-row">
          <span class="rank">${index + 2}</span>
          <div><strong>${escapeHtml(alt[0])}</strong><span>${escapeHtml(alt[2])}</span></div>
          <span class="alt-rate">${escapeHtml(alt[1])}</span>
        </div>`
        )
        .join("");
  }

  (categories || []).forEach((category, index) => {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.dataset.id = category.id;
    button.setAttribute("aria-pressed", String(index === 0));
    button.textContent = category.label;
    button.addEventListener("click", () => select(category.id));
    if (strip) strip.appendChild(button);
  });

  return { select };
}

// ---- card grid ------------------------------------------------------------

// Card filter buttons are derived from the data: any filter value used by a
// card gets a button. Known jobs sort first with friendly labels; anything
// else is title-cased in data order.
const FILTER_LABELS = {
  travel: "Travel points",
  cash: "Cash back",
  premium: "Premium",
  rotating: "Rotating",
};
const FILTER_ORDER = ["travel", "cash", "premium", "rotating"];

function labelForFilter(value) {
  return FILTER_LABELS[value] || value.charAt(0).toUpperCase() + value.slice(1);
}

export function renderCards(doc, cards, filter = "all") {
  const grid = doc.getElementById("cardGrid");
  if (!grid) return;
  grid.innerHTML = cards
    .map((card) => {
      const hidden = filter !== "all" && !(card.filters || []).includes(filter);
      return `<article class="portfolio-card${hidden ? " is-hidden" : ""}" style="--card-color:${escapeHtml(card.color)}">
          <div class="card-top">
            <div class="card-id"><span class="card-swatch"></span><div class="card-title"><h3>${escapeHtml(card.name)}</h3><p>${escapeHtml(card.issuer)}</p></div></div>
            <span class="fee">${escapeHtml(card.fee)}</span>
          </div>
          <p class="role">${escapeHtml(card.role)}</p>
          <ul class="earn-list">${(card.earns || []).map((e) => `<li><span>${escapeHtml(e[0])}</span><strong>${escapeHtml(e[1])}</strong></li>`).join("")}</ul>
          <div class="tag-row">${(card.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
        </article>`;
    })
    .join("");
}

export function buildCardFilters(doc, cards, onFilter) {
  const wrap = doc.getElementById("cardFilters");
  const seen = [];
  for (const card of cards) for (const f of card.filters || []) if (!seen.includes(f)) seen.push(f);
  const ordered = [
    ...FILTER_ORDER.filter((f) => seen.includes(f)),
    ...seen.filter((f) => !FILTER_ORDER.includes(f)),
  ];
  const filters = [
    ["all", `All ${cards.length}`],
    ...ordered.map((f) => [f, labelForFilter(f)]),
  ];
  filters.forEach(([id, label], index) => {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "filter";
    btn.dataset.filter = id;
    btn.setAttribute("aria-pressed", String(index === 0));
    btn.textContent = label;
    btn.addEventListener("click", () => {
      doc.querySelectorAll(".filter").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      onFilter(id);
    });
    if (wrap) wrap.appendChild(btn);
  });
}

// ---- card catalog ----------------------------------------------------------

function catalogCardHtml(card) {
  const fee = card.annual_fee_usd > 0 ? `$${card.annual_fee_usd}/yr` : "No annual fee";
  const earnRows = topEarn(card, 4)
    .map(
      (e) =>
        `<li><span>${escapeHtml(categoryLabel(e.key))}${e.portal_only ? " <em>(portal)</em>" : ""}${e.cap_usd ? ` <em>(cap $${e.cap_usd.toLocaleString()})</em>` : ""}</span><strong>${escapeHtml(formatPct(e.pct))}</strong></li>`
    )
    .join("");
  const bonus = bonusSummary(card);
  const credits =
    (card.credits || []).length > 0
      ? `<p class="catalog-credits">${card.credits.length} credit${card.credits.length === 1 ? "" : "s"}: ${escapeHtml(
          card.credits
            .slice(0, 3)
            .map((c) => c.name)
            .join(", ")
        )}${card.credits.length > 3 ? "…" : ""}</p>`
      : "";
  const stale =
    card.verified_date && card.verified_date < "2026-01-01"
      ? `<span class="tag tag-stale" title="Last verified ${escapeHtml(card.verified_date)}">stale data</span>`
      : "";
  const discontinued =
    card.availability === "discontinued" ? `<span class="tag tag-stale">discontinued</span>` : "";
  return `<article class="portfolio-card catalog-card" data-card-id="${escapeHtml(card.id)}">
      <div class="card-top">
        <div class="card-id"><div class="card-title"><h3>${escapeHtml(card.name)}</h3><p>${escapeHtml(card.issuer)}${card.network ? " · " + escapeHtml(card.network) : ""}</p></div></div>
        <span class="fee">${escapeHtml(fee)}</span>
      </div>
      <ul class="earn-list">${earnRows || `<li><span>Base earn</span><strong>${escapeHtml(formatPct(card.base_rate))}</strong></li>`}</ul>
      ${bonus ? `<p class="catalog-bonus">🎁 ${escapeHtml(bonus)}</p>` : ""}
      ${credits}
      <div class="tag-row">${stale}${discontinued}${
        card.currency_program && card.currency_program !== "cash"
          ? `<span class="tag">${escapeHtml(card.currency_program)}</span>`
          : `<span class="tag">cash back</span>`
        }</div>
    </article>`;
}

export function renderCatalog(doc, catalog, query = "") {
  const grid = doc.getElementById("catalogGrid");
  const meta = doc.getElementById("catalogMeta");
  if (!grid) return;
  const cards = searchCatalog(catalog.cards || [], query);
  if (meta) {
    const q = query.trim();
    meta.textContent =
      `${cards.length} of ${catalog.cards.length} cards` +
      (q ? ` matching “${q}”` : "") +
      ` · source: ${catalog.source} @ ${String(catalog.source_ref).slice(0, 7)}` +
      ` · fetched ${catalog.fetched_at.slice(0, 10)}`;
  }
  grid.innerHTML =
    cards.map(catalogCardHtml).join("") ||
    `<p class="empty">No cards match. Try a different search.</p>`;
}

export function buildCatalogSearch(doc, catalog) {
  const input = doc.getElementById("catalogSearch");
  if (!input) return;
  let t = null;
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => renderCatalog(doc, catalog, input.value), 150);
  });
}

// ---- transfer explorer -----------------------------------------------------

function transferRowHtml(programName, partner) {
  const notes = partner.notes ? ` <span class="transfer-notes">${escapeHtml(partner.notes)}</span>` : "";
  const hand = partner.provenance === "hand-compiled" ? ` <span class="tag tag-hand">hand-checked</span>` : "";
  return `<tr>
      <td><strong>${escapeHtml(partner.name || "")}</strong><br><span class="transfer-sub">${escapeHtml(partner.program || partner.currency || "")}</span></td>
      <td><span class="tag">${escapeHtml(partner.type || "")}</span></td>
      <td class="ratio"><strong>${escapeHtml(partner.ratio || "—")}</strong></td>
      <td class="transfer-meta">${programName ? escapeHtml(programName) : ""}${notes}${hand}</td>
    </tr>`;
}

export function renderTransfers(doc, data) {
  const select = doc.getElementById("transferProgram");
  const table = doc.getElementById("transferTable");
  const meta = doc.getElementById("transferMeta");
  const reverse = doc.getElementById("transferReverse");
  if (!select || !table) return;

  const draw = () => {
    const rows = partnersFor(data, select.value);
    table.innerHTML = rows.map((t) => transferRowHtml("", t)).join("");
    if (meta) {
      const p = (data.programs || []).find((x) => x.id === select.value);
      meta.textContent =
        `${rows.length} partners` +
        (p && p.coverage === "partial" ? ` · ${p.coverage_note || "partial coverage"}` : "") +
        ` · source: ${data.source} · fetched ${data.fetched_at.slice(0, 10)}`;
    }
  };

  select.innerHTML = programOptions(data)
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${p.count})</option>`)
    .join("");
  // Default to a program most users hold: Chase UR, else first.
  const preferred = ["chase-ur", "amex-mr", "citi-typ", "capital-one", "bilt"].find((id) =>
    programOptions(data).some((p) => p.id === id)
  );
  if (preferred) select.value = preferred;
  select.addEventListener("change", draw);
  draw();

  if (reverse) {
    let t = null;
    reverse.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const rows = sourcesFor(data, reverse.value);
        table.innerHTML =
          rows.map((r) => transferRowHtml(r.program.name, r.partner)).join("") ||
          `<tr><td colspan="4" class="empty">No programs transfer there. Try an airline or hotel name.</td></tr>`;
        if (meta) meta.textContent = `${rows.length} ways to get there · best ratio first`;
      }, 150);
    });
  }
}

// ---- best-card lookup ------------------------------------------------------

export function renderLookup(doc, result) {
  const box = doc.getElementById("lookupResult");
  if (!box) return;
  if (!result) {
    box.innerHTML = `<div class="lookup-empty"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m21 21-4.3-4.3m2.3-5.2a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><strong>Ready when you are</strong><p>Choose a category for a portfolio recommendation. Add a merchant to check for an activated offer override.</p></div>`;
    return;
  }
  const { category, offer, winner, rate, runners, inferred, merchant } = result;
  const categoryLabel = category.label;
  box.innerHTML = `
        <div class="lookup-kicker">${merchant ? `Recommendation for ${escapeHtml(merchant)}` : escapeHtml(categoryLabel)}</div>
        <div class="lookup-pick"><h3>${escapeHtml(winner)}</h3><span class="lookup-rate">${escapeHtml(rate)}</span></div>
        ${offer ? `<div class="offer-hit"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 12 3 3 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/></svg><div><strong>Activated offer match</strong><p>${escapeHtml(offer.terms)} · expires ${escapeHtml(offer.expiry)}${offer.note ? ` · ${escapeHtml(offer.note)}` : ""}. Merchant-name match only—confirm the saved offer terms before paying.</p></div></div>` : ""}
        <p class="lookup-reason">${offer ? `The activated ${escapeHtml(merchant)} offer takes priority over the normal ${escapeHtml(categoryLabel.toLowerCase())} earn recommendation.` : escapeHtml(category.why)}${inferred ? ` Category inferred as ${escapeHtml(categoryLabel)} from the merchant name.` : ""}</p>
        <div class="runner-list"><h4>${offer ? "Base earn and other options" : "Runner-up cards"}</h4><div class="alternates">${runners.map((alt, index) => `<div class="alt-row"><span class="rank">${index + 2}</span><div><strong>${escapeHtml(alt[0])}</strong><span>${escapeHtml(alt[2])}</span></div><span class="alt-rate">${escapeHtml(alt[1])}</span></div>`).join("")}</div></div>`;
}

// ---- offer notes -----------------------------------------------------------

export function renderOfferList(doc, offers, onRemove) {
  const list = doc.getElementById("offerList");
  if (!list) return;
  if (!offers.length) {
    list.className = "empty-state";
    list.textContent = "No offer notes yet.";
    return;
  }
  list.className = "offer-rows";
  list.innerHTML = offers
    .map(
      (offer, index) => `<div class="offer-row">
        <strong>${escapeHtml(offer.merchant)} · ${escapeHtml(offer.status)}</strong>
        <span class="card-cell">${escapeHtml(offer.card)}</span>
        <span class="terms-cell">${escapeHtml(offer.terms)}${offer.note ? " · " + escapeHtml(offer.note) : ""}</span>
        <span class="date-cell">Exp ${escapeHtml(offer.expiry)}</span>
        <button class="remove-offer" type="button" data-index="${index}" aria-label="Remove ${escapeHtml(offer.merchant)} offer">×</button>
      </div>`
    )
    .join("");
  list.querySelectorAll(".remove-offer").forEach((button) =>
    button.addEventListener("click", () => onRemove(Number(button.dataset.index)))
  );
}

export function offersToText(offers) {
  return offers
    .map(
      (o) =>
        `${o.merchant} — ${o.card} — ${o.status} — ${o.terms} — expires ${o.expiry}${o.note ? " — " + o.note : ""}`
    )
    .join("\n");
}

export function offersToCsv(offers) {
  const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const rows = [
    ["Card", "Merchant", "Status", "Offer or trigger", "Expires", "Note"],
    ...offers.map((o) => [o.card, o.merchant, o.status, o.terms, o.expiry, o.note]),
  ];
  return rows.map((row) => row.map(quote).join(",")).join("\n");
}
