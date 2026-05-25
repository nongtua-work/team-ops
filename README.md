# TEAM Chardchakaj — Internal Ops

iPhone-first project management web app for the TEAM Chardchakaj fashion studio
(7 people). Designed to open as a LINE LIFF app and persist to a Google Sheet
via Apps Script — zero hosting cost.

## What's in this repo

```
index.html              The whole app — React 18 + Babel-in-browser, no build step
config.js               Runtime config: LIFF_ID, APPS_SCRIPT_URL, APP_TOKEN
app-backend.js          LIFF init + Apps Script REST client
apps-script/Code.gs     Server-side: Sheets CRUD + LINE push notifications
project-management/     Original design handoff bundle (reference only)
```

The app runs as-is by just opening `index.html` — it uses the inline seed data
in `window.APP_DATA`. To make it persist and notify real users, wire up the
three integrations below.

## Setup

### 1. Google Sheet + Apps Script (backend)

1. Create a new Google Sheet.
2. Add tabs named exactly: `tasks`, `projects`, `equipment`, `approvals`,
   `team`, `links`, `logs`. The header row for each is documented at the top
   of `apps-script/Code.gs`.
3. Extensions → Apps Script. Paste `apps-script/Code.gs` over the default file.
4. Project Settings → Script Properties:
   - `APP_TOKEN` — any random string (optional; gates the API)
   - `LINE_ACCESS_TOKEN` — channel access token from your LINE Messaging API channel
5. Deploy → New deployment → Type: **Web app** → Execute as: **Me** →
   Who has access: **Anyone**. Copy the `/exec` URL.

### 2. LINE LIFF (login + in-LINE webview)

1. LINE Developers → Providers → New channel → **LINE Login**.
2. LIFF tab → Add → Endpoint URL = your hosted `index.html` (e.g. the GitHub Pages URL),
   Size = **Full**, Scope = `profile openid`. Copy the LIFF ID.
3. For push notifications, create a separate **Messaging API** channel under
   the same provider and copy its access token into Script Properties above.

### 3. Hosting (GitHub Pages)

1. Push this repo to GitHub.
2. Settings → Pages → Source: **Deploy from a branch** → `main` / root.
3. Use the resulting `https://<user>.github.io/<repo>/` as the LIFF endpoint.

### 4. Fill in `config.js`

```js
window.TC_CONFIG = {
  LIFF_ID: '1234567890-AbCdEfGh',
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfy.../exec',
  APP_TOKEN: 'paste-the-same-string-here',
  SYNC_INTERVAL_SEC: 60,
};
```

Reload — you should see a console line `[TC]` only if something fails. The
header avatar will show the real LINE display name once LIFF login completes.

## How the backend talks to the prototype

- On boot, `app-backend.js` calls `GET ?path=all` once. The response's
  top-level keys (`team`, `projects`, `project`, `assetTypes`, …) overwrite
  the matching keys in `window.APP_DATA` before React mounts.
- It then polls every `SYNC_INTERVAL_SEC` seconds and dispatches a
  `tc-data-sync` window event. The current React tree doesn't listen yet —
  add `useSyncExternalStore` or a top-level `forceUpdate` when you want
  live refresh.
- Writes are not yet wired into the React components. Call
  `window.BACKEND.save('tasks', { id, status: 'done' })` from an `onClick`
  to start persisting. Same for `'approvals'`, `'equipment'`, etc.
- Notifications: `window.BACKEND.notify(lineUserId, 'งานของคุณถูก approve')`.

## Roles

The prototype's "View as" tweaks panel (bottom-right) switches between the
seven team members. Lead can edit anything; Founder is read-only + approval;
others view + update their own tasks. Once the backend is live, role gating
should move server-side using the LIFF `userId` → `team.lineUserId` lookup
(`lookupUser_` in `Code.gs`).
