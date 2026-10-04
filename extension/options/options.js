const $ = (id) => document.getElementById(id);

const BANK_LABELS = { amex: "Amex", chase: "Chase", citi: "Citi", bofa: "Bank of America" };
const DEFAULT_SETTINGS = {
  banks: { amex: true, chase: true, citi: true, bofa: false },
  scheduleEnabled: false,
  scheduleDay: 0,
  scheduleHour: 9,
  checkoutEnabled: false,
  maxPerRun: 400,
};

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}
async function saveSettings(patch) {
  const s = await getSettings();
  await chrome.storage.local.set({ settings: { ...s, ...patch } });
}

// ---------- Portfolio ----------
$("portfolioFile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  $("portfolioText").value = await f.text();
});

$("savePortfolio").addEventListener("click", async () => {
  const status = $("portfolioStatus");
  try {
    const p = JSON.parse($("portfolioText").value);
    if (!Array.isArray(p.categories)) throw new Error("needs a top-level \"categories\" array");
    await chrome.storage.local.set({ portfolio: p });
    status.textContent = `Saved — ${p.categories.length} categories${p.offers ? `, ${p.offers.length} offers` : ""}.`;
    status.className = "status ok";
  } catch (err) {
    status.textContent = "Invalid JSON: " + err.message;
    status.className = "status err";
  }
});

// ---------- Banks ----------
async function renderBanks() {
  const s = await getSettings();
  const wrap = $("bankToggles");
  wrap.innerHTML = "";
  for (const [id, label] of Object.entries(BANK_LABELS)) {
    const lab = document.createElement("label");
    lab.className = "row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!s.banks[id];
    cb.addEventListener("change", async () => {
      const cur = await getSettings();
      cur.banks[id] = cb.checked;
      saveSettings({ banks: cur.banks });
    });
    lab.append(cb, document.createTextNode(" " + label));
    wrap.append(lab);
  }
}

// ---------- Schedule ----------
function renderHours() {
  const sel = $("scheduleHour");
  for (let h = 0; h < 24; h++) {
    const o = document.createElement("option");
    o.value = h;
    const ap = h < 12 ? "AM" : "PM";
    const hh = h % 12 === 0 ? 12 : h % 12;
    o.textContent = `${hh} ${ap}`;
    sel.append(o);
  }
}

async function loadSchedule() {
  const s = await getSettings();
  $("scheduleEnabled").checked = s.scheduleEnabled;
  $("scheduleDay").value = String(s.scheduleDay);
  $("scheduleHour").value = String(s.scheduleHour);
  $("maxPerRun").value = s.maxPerRun;
  $("checkoutEnabled").checked = s.checkoutEnabled;
}

$("scheduleEnabled").addEventListener("change", (e) => saveSettings({ scheduleEnabled: e.target.checked }));
$("scheduleDay").addEventListener("change", (e) => saveSettings({ scheduleDay: Number(e.target.value) }));
$("scheduleHour").addEventListener("change", (e) => saveSettings({ scheduleHour: Number(e.target.value) }));
$("maxPerRun").addEventListener("change", (e) =>
  saveSettings({ maxPerRun: Math.max(10, Math.min(1000, Number(e.target.value) || 400)) })
);
$("runNow").addEventListener("click", async () => {
  $("runNow").disabled = true;
  $("runNow").textContent = "Running…";
  await chrome.runtime.sendMessage({ type: "cc-run-weekly-now" });
  $("runNow").textContent = "Done — check the log below";
  setTimeout(() => {
    $("runNow").disabled = false;
    $("runNow").textContent = "Run now";
    renderLog();
  }, 3000);
});

// ---------- Checkout permission ----------
$("checkoutEnabled").addEventListener("change", async (e) => {
  const on = e.target.checked;
  const status = $("permStatus");
  if (on) {
    const granted = await chrome.permissions.request({ origins: ["<all_urls>"] });
    if (!granted) {
      e.target.checked = false;
      status.textContent = "Permission denied — checkout recommendations stay off.";
      status.className = "status err";
      return;
    }
    status.textContent = "Permission granted.";
    status.className = "status ok";
  } else {
    await chrome.permissions.remove({ origins: ["<all_urls>"] });
    status.textContent = "";
  }
  saveSettings({ checkoutEnabled: on });
});

// ---------- Enrollment log ----------
async function renderLog() {
  const { enrollLog } = await chrome.storage.local.get("enrollLog");
  const ul = $("enrollLog");
  ul.innerHTML = "";
  if (!enrollLog || !enrollLog.length) {
    ul.innerHTML = "<li class='hint'>No runs yet.</li>";
    return;
  }
  for (const r of enrollLog.slice(0, 10)) {
    const li = document.createElement("li");
    const when = new Date(r.startedAt).toLocaleString();
    li.textContent =
      `${r.bank} · ${when} — ${r.enrolled} enrolled, ${r.failed} failed, ${r.skipped} skipped` +
      (r.status !== "done" ? ` (${r.status}: ${r.reason})` : "");
    ul.append(li);
  }
}

// ---------- Init ----------
(async function init() {
  renderHours();
  const { portfolio } = await chrome.storage.local.get("portfolio");
  if (portfolio) {
    $("portfolioText").value = JSON.stringify(portfolio).slice(0, 400) + "…";
    $("portfolioStatus").textContent = `Loaded — ${portfolio.categories.length} categories.`;
    $("portfolioStatus").className = "status ok";
  }
  renderBanks();
  loadSchedule();
  renderLog();
})();
