// Service worker: weekly enrollment schedule, notifications, and
// on-demand checkout-overlay injection. Module script.

const BANKS = {
  amex: { label: "Amex", host: "americanexpress.com", offersUrl: "https://online.americanexpress.com/myca/offers/" },
  chase: { label: "Chase", host: "chase.com", offersUrl: "https://www.chase.com/" },
  bofa: { label: "Bank of America", host: "bankofamerica.com", offersUrl: "https://www.bankofamerica.com/" },
  citi: { label: "Citi", host: "citi.com", offersUrl: "https://online.citi.com/US/nga/products-offers/merchantoffers" },
};

const DEFAULT_SETTINGS = {
  banks: { amex: true, chase: true, citi: true, bofa: false },
  scheduleEnabled: false,
  scheduleDay: 0, // Sunday
  scheduleHour: 9, // 9 AM local
  checkoutEnabled: false,
  maxPerRun: 400,
};

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

// ---------- Weekly schedule ----------
const ALARM = "cc-weekly-enroll";

async function scheduleWeekly() {
  await chrome.alarms.clear(ALARM);
  const s = await getSettings();
  if (!s.scheduleEnabled) return;
  const now = new Date();
  const next = new Date(now);
  next.setHours(s.scheduleHour, 0, 0, 0);
  let delta = (s.scheduleDay - now.getDay() + 7) % 7;
  if (delta === 0 && next <= now) delta = 7;
  next.setDate(now.getDate() + delta);
  chrome.alarms.create(ALARM, { when: next.getTime(), periodInMinutes: 7 * 24 * 60 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM) await runWeeklyEnrollment();
});

async function runWeeklyEnrollment() {
  const s = await getSettings();
  const results = [];
  for (const [bankId, enabled] of Object.entries(s.banks)) {
    if (!enabled || bankId === "bofa") continue; // BofA deals are auto-active
    const bank = BANKS[bankId];
    const tabs = await chrome.tabs.query({ url: `*://*.${bank.host}/*` });
    let handled = false;
    for (const tab of tabs) {
      try {
        const probe = await chrome.tabs.sendMessage(tab.id, { type: "cc-probe" });
        if (probe && probe.ok && probe.bank === bankId && probe.signedIn && !probe.blocked && probe.unenrolled > 0) {
          const resp = await chrome.tabs.sendMessage(tab.id, {
            type: "cc-enroll",
            bank: bankId,
            maxPerRun: s.maxPerRun,
          });
          results.push({ bank: bankId, report: resp && resp.report });
          handled = true;
          break;
        }
      } catch (_) {
        /* tab not ready — try next */
      }
    }
    if (!handled) results.push({ bank: bankId, needsTab: true });
  }

  const auto = results.filter((r) => r.report);
  const manual = results.filter((r) => r.needsTab);
  const enrolled = auto.reduce((n, r) => n + (r.report.enrolled || 0), 0);
  chrome.notifications.create("cc-weekly", {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon48.png"),
    title: "Weekly offer enrollment",
    message:
      auto.length === 0
        ? "No signed-in bank tabs found. Open each bank's offers page and use the popup to enroll."
        : `${enrolled} offers auto-enrolled across ${auto.length} bank${auto.length === 1 ? "" : "s"}.` +
          (manual.length ? ` Open ${manual.map((m) => BANKS[m.bank].label).join(", ")} to finish the rest.` : ""),
  });
}

// Notification click -> open the first bank that still needs attention.
chrome.notifications.onClicked.addListener(async (id) => {
  if (id !== "cc-weekly") return;
  const s = await getSettings();
  for (const [bankId, enabled] of Object.entries(s.banks)) {
    if (enabled && bankId !== "bofa") {
      chrome.tabs.create({ url: BANKS[bankId].offersUrl });
      break;
    }
  }
  chrome.notifications.clear(id);
});

// ---------- Checkout overlay injection ----------
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete" || !tab.url || !/^https?:/.test(tab.url)) return;
  const s = await getSettings();
  if (!s.checkoutEnabled) return;
  if (Object.values(BANKS).some((b) => tab.url.includes(b.host))) return; // not on bank pages
  const hasPerm = await chrome.permissions.contains({ origins: ["<all_urls>"] });
  if (!hasPerm) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content/checkout.js"] });
  } catch (_) {
    /* e.g. chrome:// pages — ignore */
  }
});

// ---------- Lifecycle ----------
chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get("settings");
  if (!settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  await scheduleWeekly();
});

chrome.runtime.onStartup.addListener(scheduleWeekly);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) scheduleWeekly();
});

// Allow the options page / popup to trigger things explicitly.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "cc-run-weekly-now") {
    runWeeklyEnrollment().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === "cc-open-bank") {
    const bank = BANKS[msg.bank];
    if (bank) chrome.tabs.create({ url: bank.offersUrl });
    sendResponse({ ok: !!bank });
  }
});
