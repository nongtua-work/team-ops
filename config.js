// TEAM Chardchakaj — runtime config
// Edit this file after you've created your LINE LIFF channel and deployed
// the Apps Script Web App. See README.md for step-by-step.
//
// Safe to commit — these are public-side identifiers, not secrets.
// (Real secrets like the LINE Messaging access token live in Apps Script
// Script Properties, never here.)

window.TC_CONFIG = {
  // From the LINE Developers console → your LIFF app.
  // Format: "1234567890-AbCdEfGh". Leave empty to skip LIFF init
  // (the app then runs as a normal web page without LINE login).
  LIFF_ID: '2010125903-hSMEChl3',

  // Apps Script Web App URL — the /exec endpoint after you Deploy → New deployment → Web app.
  // Looks like: https://script.google.com/macros/s/AKfycb.../exec
  // Leave empty to run with local seed data only (no Sheets sync).
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzzoUjQ8O5KU-Ml9Fz6vjEOZxgX95jn37jANiEfy8A9DdQP97MtC9QHhq53QlyDJxffsg/exec',

  // Shared secret echoed to Apps Script on every request, checked server-side.
  // Generate any random string and paste the same value into Script Properties → APP_TOKEN.
  // Optional — if you leave it empty here AND in Script Properties, auth is skipped.
  APP_TOKEN: '',

  // Polling cadence for read-only sync from Sheets, in seconds. 0 = no polling.
  SYNC_INTERVAL_SEC: 60,
};
