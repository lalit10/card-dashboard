// Enrollment engine — shared by all bank adapters.
//
// A bank adapter is a plain object:
//   {
//     id: 'citi', label: 'Citi',
//     offersUrl: 'https://…',          // deep link, used in notifications
//     isSignedIn(): boolean,           // false -> ask the user to sign in
//     isBlocked(): false | 'captcha' | 'error',  // bot walls -> abort cleanly
//     findUnenrolled(): Array<{ el, key }>,
//     enroll(offer): Promise<'enrolled'|'failed'|'skipped'>
//   }
//
// Safety rules (non-negotiable):
// - Never touches login forms, never fills credentials, never clicks "sign in".
// - Randomized cooldowns between enrollments; hard cap per run.
// - Aborts immediately on captcha/error pages and reports the reason.
// - Everything stays in chrome.storage.local. No network calls except the
//   bank's own pages.

(function () {
  "use strict";

  const DEFAULTS = {
    cooldownMs: [1200, 2800], // randomized per enrollment
    maxPerRun: 400,
    progressEvery: 25,
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = ([lo, hi]) => lo + Math.random() * (hi - lo);

  async function run(adapter, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const report = {
      bank: adapter.id,
      startedAt: new Date().toISOString(),
      enrolled: 0,
      failed: 0,
      skipped: 0,
      status: "done",
      reason: "",
    };
    const emit = options.onProgress || (() => {});

    if (!adapter.isSignedIn()) {
      report.status = "needs-signin";
      report.reason = "Not signed in — sign in to " + adapter.label + " first.";
      emit({ ...report });
      return report;
    }
    const blocked = adapter.isBlocked();
    if (blocked) {
      report.status = "blocked";
      report.reason = "Page looks blocked (" + blocked + "). Try again later or sign in manually.";
      emit({ ...report });
      return report;
    }

    const offers = adapter.findUnenrolled().slice(0, opts.maxPerRun);
    report.total = offers.length;
    emit({ ...report, phase: "starting" });

    for (let i = 0; i < offers.length; i++) {
      if (adapter.isBlocked()) {
        report.status = "blocked";
        report.reason = "Blocked mid-run — stopping to stay safe.";
        break;
      }
      try {
        const outcome = await adapter.enroll(offers[i]);
        if (outcome === "enrolled") report.enrolled++;
        else if (outcome === "skipped") report.skipped++;
        else report.failed++;
      } catch (err) {
        report.failed++;
      }
      if ((i + 1) % opts.progressEvery === 0 || i === offers.length - 1) {
        emit({ ...report, phase: "running", done: i + 1 });
      }
      if (i < offers.length - 1) await sleep(jitter(opts.cooldownMs));
    }

    report.finishedAt = new Date().toISOString();
    emit({ ...report, phase: "done" });

    // Persist a local run log (chrome.storage.local only).
    try {
      const key = "enrollLog";
      const prev = (await chrome.storage.local.get(key))[key] || [];
      prev.unshift(report);
      await chrome.storage.local.set({ [key]: prev.slice(0, 20) });
    } catch (_) {
      /* storage unavailable — report still returned */
    }
    return report;
  }

  // Message API: the popup / service worker can trigger a run on the
  // active bank tab via chrome.tabs.sendMessage(tabId, {type:'cc-enroll'}).
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "cc-enroll") {
      const adapter = (window.CardCompanionAdapters || {})[msg.bank];
      if (!adapter) {
        sendResponse({ ok: false, reason: "no adapter for " + msg.bank });
        return true;
      }
      run(adapter, {
        maxPerRun: msg.maxPerRun,
        onProgress: (r) => chrome.runtime.sendMessage({ type: "cc-enroll-progress", report: r }).catch(() => {}),
      }).then((report) => sendResponse({ ok: true, report }));
      return true; // async response
    }
    if (msg && msg.type === "cc-probe") {
      // Which bank is this page, and what's its state? Used by the popup.
      const found = Object.values(window.CardCompanionAdapters || {}).find((a) => {
        try {
          return a.isSignedIn() !== undefined && a.matchesPage();
        } catch (_) {
          return false;
        }
      });
      sendResponse({
        ok: true,
        bank: found ? found.id : null,
        signedIn: found ? found.isSignedIn() : false,
        blocked: found ? found.isBlocked() : false,
        unenrolled: found ? found.findUnenrolled().length : 0,
      });
      return true;
    }
  });

  window.CardCompanionEnroll = { run, DEFAULTS };
})();
