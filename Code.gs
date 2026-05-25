/**
 * TEAM Chardchakaj — Web App backend
 *
 * Deploy: Extensions → Apps Script (from the bound Sheet), paste this file,
 * then Deploy → New deployment → Type "Web app" → Execute as "Me" → Access
 * "Anyone". Paste the resulting /exec URL into config.js as APPS_SCRIPT_URL.
 *
 * Script Properties to set (Project Settings → Script Properties):
 *   APP_TOKEN              — shared secret matching config.js APP_TOKEN (optional)
 *   LINE_ACCESS_TOKEN      — LINE Messaging API channel access token (required for notify)
 *
 * Sheet tabs expected (create them in the bound Sheet; first row is the header):
 *   tasks       id | title | project | owner | due | status | priority | tag | note
 *   projects    id | code | name | sub | cover | progress | daysLeft | status | archived
 *   equipment   id | cat | name | sn | state | who | ret
 *   approvals   id | title | project | requester | status | urgent | created | decidedBy | decidedAt | links
 *   team        id | name | role | short | tint | online | isBoss | isLead | lineUserId
 *   links       id | project | title | url | platform | tag | approved | owner | createdAt
 *   logs        ts | path | actor | payload
 */

const TABS = ['tasks', 'projects', 'equipment', 'approvals', 'team', 'links', 'logs'];

function doGet(e) {
  return handle_(e, 'GET');
}

function doPost(e) {
  return handle_(e, 'POST');
}

function handle_(e, method) {
  try {
    const params = e.parameter || {};
    let body = {};
    if (method === 'POST' && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    const path = (body.path || params.path || '').toString();
    const token = body.token || params.token;
    if (!checkToken_(token)) return json_({ error: 'unauthorized' }, 401);

    log_(path, body.actor || params.uid || 'anon', method === 'POST' ? body.body : params);

    if (method === 'GET') {
      if (path === 'all') return json_(snapshotAll_());
      if (TABS.includes(path)) return json_({ [path]: readTab_(path) });
      return json_({ error: 'unknown path: ' + path }, 400);
    }

    // POST
    if (path === 'notify') return json_(notifyLine_(body.body));
    if (path === 'approval') return json_(decideApproval_(body.body));
    if (TABS.includes(path)) return json_(upsert_(path, body.body));
    return json_({ error: 'unknown path: ' + path }, 400);
  } catch (err) {
    return json_({ error: String(err && err.message || err) }, 500);
  }
}

// --- Auth -------------------------------------------------------------------

function checkToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
  if (!expected) return true; // auth disabled
  return token === expected;
}

// --- Sheet IO ---------------------------------------------------------------

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Missing sheet tab: ' + name);
  return sh;
}

function readTab_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      obj[key] = values[r][c];
    }
    rows.push(obj);
  }
  return rows;
}

function upsert_(name, row) {
  if (!row || typeof row !== 'object') throw new Error('body must be an object');
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('id');
  if (idCol < 0) throw new Error('tab ' + name + ' has no `id` header');

  // Find existing row by id.
  let rowIndex = -1;
  if (row.id != null) {
    for (let r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(row.id)) { rowIndex = r; break; }
    }
  }
  if (row.id == null) row.id = Utilities.getUuid();

  const out = headers.map(h => (h in row ? row[h] : (rowIndex >= 0 ? values[rowIndex][headers.indexOf(h)] : '')));
  if (rowIndex >= 0) {
    sh.getRange(rowIndex + 1, 1, 1, headers.length).setValues([out]);
  } else {
    sh.appendRow(out);
  }
  return { ok: true, id: row.id };
}

function snapshotAll_() {
  const out = {};
  TABS.forEach(t => { if (t !== 'logs') out[t] = readTab_(t); });
  // Convenience: derive current "project" focus for the prototype's APP_DATA.project field.
  // The prototype expects window.APP_DATA.project to be the active project's detail bundle.
  // Adjust this as your schema grows; for now we return the first non-archived project.
  const projects = out.projects || [];
  const active = projects.find(p => !p.archived) || projects[0];
  if (active) {
    out.project = Object.assign({}, active, {
      tasks: (out.tasks || []).filter(t => t.project === active.code),
      equipment: out.equipment || [],
      approvals: (out.approvals || []).filter(a => a.project === active.code),
      links: (out.links || []).filter(l => l.project === active.code),
      coreTeam: (out.team || []).map(u => u.id),
      freelancers: [],
    });
  }
  return out;
}

// --- LINE notifications ----------------------------------------------------

function notifyLine_(payload) {
  if (!payload || !payload.to || !payload.message) throw new Error('notify needs {to, message}');
  const token = PropertiesService.getScriptProperties().getProperty('LINE_ACCESS_TOKEN');
  if (!token) throw new Error('LINE_ACCESS_TOKEN not set in Script Properties');
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      to: payload.to,
      messages: [{ type: 'text', text: payload.message }],
    }),
    muteHttpExceptions: true,
  });
  return { ok: res.getResponseCode() === 200, status: res.getResponseCode() };
}

function decideApproval_(payload) {
  if (!payload || !payload.id || !payload.decision) throw new Error('approval needs {id, decision, by}');
  upsert_('approvals', {
    id: payload.id,
    status: payload.decision, // 'approved' | 'revise' | 'rejected'
    decidedBy: payload.by || '',
    decidedAt: new Date().toISOString(),
  });
  if (payload.notifyLineUserId) {
    notifyLine_({
      to: payload.notifyLineUserId,
      message: 'งานของคุณถูก ' + payload.decision + (payload.note ? '\n' + payload.note : ''),
    });
  }
  return { ok: true };
}

function lookupUser_(lineUserId) {
  const rows = readTab_('team');
  return rows.find(u => u.lineUserId === lineUserId) || null;
}

// --- Logs ------------------------------------------------------------------

function log_(path, actor, payload) {
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('logs');
    if (!sh) return;
    sh.appendRow([new Date().toISOString(), path, actor, JSON.stringify(payload || {}).slice(0, 1000)]);
  } catch (_) { /* never let logging break a request */ }
}

// --- Response helpers ------------------------------------------------------

function json_(obj, status) {
  // Apps Script doesn't expose custom status codes from ContentService, but
  // returning the error field lets the client surface failures.
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
