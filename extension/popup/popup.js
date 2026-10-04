import { recommend } from "../vendor/recommender.js";
import { escapeHtml } from "../vendor/util.js";

const $ = (id) => document.getElementById(id);

async function getPortfolio() {
  const { portfolio } = await chrome.storage.local.get("portfolio");
  return portfolio || null;
}

// ---------- Best-card lookup ----------
let portfolio = null;

async function lookup() {
  const merchant = $("merchant").value.trim();
  const result = $("result");
  if (!portfolio) {
    $("noPortfolio").classList.remove("hidden");
    result.classList.add("hidden");
    return;
  }
  $("noPortfolio").classList.add("hidden");
  if (!merchant) {
    result.classList.add("hidden");
    return;
  }
  const r = recommend({
    categories: portfolio.categories || [],
    merchant,
    offers: portfolio.offers || [],
  });
  $("winner").innerHTML = `Use <strong>${escapeHtml(r.winner)}</strong>`;
  $("detail").textContent = r.offer
    ? `${r.offer.merchant} — ${r.offer.summary}`
    : `${r.category.label} · ${r.rate}${r.inferred ? " (inferred)" : ""}`;
  $("runners").innerHTML = r.runners
    .map(([card, rate]) => `<li>${escapeHtml(card)} · ${escapeHtml(rate)}</li>`)
    .join("");
  result.classList.remove("hidden");
}

// ---------- Bank panel: probe the active tab ----------
async function probeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || "")) return;
  let resp = null;
  try {
    resp = await chrome.tabs.sendMessage(tab.id, { type: "cc-probe" });
  } catch (_) {
    return; // content scripts not on this page
  }
  if (!resp || !resp.ok || !resp.bank) return;
  $("bankPanel").classList.remove("hidden");
  $("bankName").textContent = { amex: "Amex", chase: "Chase", bofa: "Bank of America", citi: "Citi" }[resp.bank] || resp.bank;
  const state = $("bankState");
  const btn = $("enrollBtn");
  if (!resp.signedIn) {
    state.textContent = "You're not signed in on this tab — sign in first.";
    btn.disabled = true;
  } else if (resp.blocked) {
    state.textContent = "This page looks blocked (" + resp.blocked + "). Try again later.";
    btn.disabled = true;
  } else if (resp.bank === "bofa") {
    state.textContent = "BankAmeriDeals are auto-active — nothing to enroll.";
    btn.disabled = true;
  } else {
    state.textContent = `${resp.unenrolled} unenrolled offer${resp.unenrolled === 1 ? "" : "s"} found on this page.`;
    btn.disabled = resp.unenrolled === 0;
    btn.dataset.bank = resp.bank;
    btn.dataset.tabId = tab.id;
  }
}

async function enrollNow() {
  const btn = $("enrollBtn");
  const bank = btn.dataset.bank;
  const tabId = Number(btn.dataset.tabId);
  btn.disabled = true;
  $("progress").classList.remove("hidden");
  $("enrollMsg").textContent = "Starting…";
  const onMsg = (msg) => {
    if (msg && msg.type === "cc-enroll-progress" && msg.report) {
      const r = msg.report;
      const total = r.total || 0;
      const done = r.done || r.enrolled + r.failed + r.skipped;
      $("bar").style.width = total ? Math.round((100 * done) / total) + "%" : "0%";
      $("enrollMsg").textContent =
        r.phase === "done"
          ? `Done: ${r.enrolled} enrolled, ${r.failed} failed, ${r.skipped} skipped.`
          : `Working… ${done}/${total}`;
    }
  };
  chrome.runtime.onMessage.addListener(onMsg);
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: "cc-enroll", bank });
    if (resp && resp.ok && resp.report.status !== "done") {
      $("enrollMsg").textContent = resp.report.reason || resp.report.status;
    }
  } catch (e) {
    $("enrollMsg").textContent = "Couldn't reach the page. Reload it and try again.";
  } finally {
    chrome.runtime.onMessage.removeListener(onMsg);
    btn.disabled = false;
  }
}

// ---------- Init ----------
$("merchant").addEventListener("input", lookup);
$("enrollBtn").addEventListener("click", enrollNow);
$("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("goOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());

(async function init() {
  portfolio = await getPortfolio();
  if (!portfolio) $("noPortfolio").classList.remove("hidden");
  const { enrollLog } = await chrome.storage.local.get("enrollLog");
  if (enrollLog && enrollLog[0]) {
    const r = enrollLog[0];
    $("lastRun").textContent = `Last run: ${r.bank} · ${r.enrolled} enrolled · ${new Date(r.startedAt).toLocaleDateString()}`;
  }
  probeTab();
})();
