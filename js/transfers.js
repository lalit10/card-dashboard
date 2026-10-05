// Transfer explorer helpers — pure functions over data/transfer-partners.json.

/** Programs sorted by name, for the currency picker. */
export function programOptions(data) {
  return (data.programs || []).map((p) => ({
    id: p.id,
    name: p.name,
    count: p.partners.length,
    coverage: p.coverage,
  }));
}

/** Partners for one program id, airlines first then hotels. */
export function partnersFor(data, programId) {
  const p = (data.programs || []).find((x) => x.id === programId);
  if (!p) return [];
  const rank = { airline: 0, hotel: 1 };
  return [...p.partners].sort(
    (a, b) => (rank[a.type] ?? 2) - (rank[b.type] ?? 2) || (a.name || "").localeCompare(b.name || "")
  );
}

/**
 * Reverse lookup: which programs transfer to an airline/hotel matching query.
 * Returns [{ program, partner }] rows.
 */
export function sourcesFor(data, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const rows = [];
  for (const p of data.programs || []) {
    for (const t of p.partners) {
      const hay = `${t.name} ${t.program} ${t.currency}`.toLowerCase();
      if (hay.includes(q)) rows.push({ program: p, partner: t });
    }
  }
  // Best ratio first.
  return rows.sort((a, b) => (b.partner.ratio_value ?? 0) - (a.partner.ratio_value ?? 0));
}

export function formatRatio(partner) {
  return partner.ratio || "—";
}
