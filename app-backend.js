// TEAM Chardchakaj — backend client
// Bridges the React prototype (window.APP_DATA) to:
//   1. LINE LIFF SDK — login + profile
//   2. Google Apps Script Web App — Sheets-backed CRUD + LINE push notifications
//
// All operations degrade gracefully: if config is empty or the network fails,
// the app keeps running on the inline seed data baked into index.html.

(function () {
  const cfg = window.TC_CONFIG || {};
  const hasLiff = !!cfg.LIFF_ID;
  const hasBackend = !!cfg.APPS_SCRIPT_URL;

  const state = { liffReady: false, profile: null, lastSync: null };

  // --- LIFF -----------------------------------------------------------------

  async function initLiff() {
    if (!hasLiff || typeof liff === 'undefined') return;
    await liff.init({ liffId: cfg.LIFF_ID });
    state.liffReady = true;
    if (!liff.isLoggedIn()) {
      // Will redirect away — no point continuing this turn.
      liff.login();
      return new Promise(() => {});
    }
    state.profile = await liff.getProfile();
    // Patch the current-user card so the UI greets the real LINE user.
    if (window.APP_DATA && state.profile) {
      const me = window.APP_DATA.user || {};
      window.APP_DATA.user = {
        ...me,
        lineUserId: state.profile.userId,
        name: state.profile.displayName || me.name,
        avatar: state.profile.pictureUrl || me.avatar,
      };
    }
  }

  // --- Apps Script REST -----------------------------------------------------
  // POST uses text/plain on purpose: Apps Script Web Apps don't respond to the
  // CORS preflight that application/json triggers. The server reads the raw
  // body via e.postData.contents and JSON.parses it.

  async function apiGet(path, params = {}) {
    if (!hasBackend) return null;
    const url = new URL(cfg.APPS_SCRIPT_URL);
    url.searchParams.set('path', path);
    if (cfg.APP_TOKEN) url.searchParams.set('token', cfg.APP_TOKEN);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), { method: 'GET' });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.json();
  }

  async function apiPost(path, body) {
    if (!hasBackend) return null;
    const res = await fetch(cfg.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ path, token: cfg.APP_TOKEN || undefined, body }),
    });
    if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
    return res.json();
  }

  // --- Data hydration -------------------------------------------------------
  // The server's "all" endpoint returns { team, projects, project, assetTypes, ... }.
  // We merge each present top-level key so a partial response can't blank the UI.

  async function hydrate() {
    if (!hasBackend) return;
    const data = await apiGet('all', state.profile ? { uid: state.profile.userId } : {});
    if (!data || typeof data !== 'object') return;
    for (const k of Object.keys(data)) {
      if (data[k] != null) window.APP_DATA[k] = data[k];
    }
    state.lastSync = new Date();
    window.dispatchEvent(new CustomEvent('tc-data-sync', { detail: { at: state.lastSync } }));
  }

  function startPolling() {
    const interval = Number(cfg.SYNC_INTERVAL_SEC || 0);
    if (!hasBackend || interval <= 0) return;
    setInterval(() => { hydrate().catch(err => console.warn('[TC] sync failed:', err)); }, interval * 1000);
  }

  // --- Public surface -------------------------------------------------------

  window.BACKEND = {
    async bootstrap() {
      try { await initLiff(); } catch (err) { console.warn('[TC] LIFF init failed:', err); }
      try { await hydrate(); } catch (err) { console.warn('[TC] initial sync failed:', err); }
      startPolling();
    },
    // Mutations — call from React event handlers when you wire them up.
    // Example: BACKEND.save('tasks', { id, status: 'done' })
    save(path, body) { return apiPost(path, body); },
    // Push a LINE message via the Apps Script proxy. Server holds the access token.
    notify(lineUserId, message) { return apiPost('notify', { to: lineUserId, message }); },
    // Manual re-sync (e.g. pull-to-refresh).
    sync() { return hydrate(); },
    get state() { return { ...state }; },
    get configured() { return { liff: hasLiff, backend: hasBackend }; },
  };
})();
