// Gemeinsame Helfer für die API (keine npm-Abhängigkeiten):
// Table Storage (REST, SharedKeyLite), ACS-Email (REST, HMAC), Passwort-Hash, Session-Cookie.
const crypto = require('crypto');
const env = process.env;

const TABLE = 'users';
const PK = 'u';
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (key, data, enc) => crypto.createHmac('sha256', key).update(data).digest(enc);

/* ---------- Table Storage ---------- */
async function table(method, path, { body, resource, extra } = {}) {
  const date = new Date().toUTCString();
  const sig = hmac(Buffer.from(env.STORAGE_KEY, 'base64'), `${date}\n/${env.STORAGE_ACCOUNT}${resource || path}`, 'base64');
  return fetch(`https://${env.STORAGE_ACCOUNT}.table.core.windows.net${path}`, {
    method,
    headers: {
      'x-ms-date': date, 'x-ms-version': '2019-02-02',
      Authorization: `SharedKeyLite ${env.STORAGE_ACCOUNT}:${sig}`,
      Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json', ...extra
    },
    body: body ? JSON.stringify(body) : undefined
  });
}
const entityPath = email => `/${TABLE}(PartitionKey='${PK}',RowKey='${encodeURIComponent(email)}')`;

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  const r = await table('POST', '/Tables', { body: { TableName: TABLE } });
  if (!r.ok && r.status !== 409) throw new Error('Tabelle anlegen: HTTP ' + r.status);
  tableReady = true;
}
async function getUser(email) {
  const r = await table('GET', entityPath(email));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Nutzer lesen: HTTP ' + r.status);
  return r.json();
}
async function insertUser(entity) { // 'exists' bei Duplikat
  await ensureTable();
  const r = await table('POST', `/${TABLE}`, { body: entity });
  if (r.status === 409) return 'exists';
  if (!r.ok) throw new Error('Nutzer anlegen: HTTP ' + r.status);
  return 'ok';
}
async function replaceUser(entity) {
  const r = await table('PUT', entityPath(entity.RowKey), { body: entity, extra: { 'If-Match': '*' } });
  if (!r.ok) throw new Error('Nutzer ändern: HTTP ' + r.status);
}
async function deleteUser(email) {
  await table('DELETE', entityPath(email), { extra: { 'If-Match': '*' } });
}

/* ---------- Eigene Wortlisten (Tabelle "lists", pro Nutzer getrennt) ---------- */
const keyPart = s => sha256(s).slice(0, 32);
const listEntity = (pk, rk) => `/lists(PartitionKey='${pk}',RowKey='${rk}')`;
let listsReady = false;
async function ensureLists() {
  if (listsReady) return;
  const r = await table('POST', '/Tables', { body: { TableName: 'lists' } });
  if (!r.ok && r.status !== 409) throw new Error('Tabelle lists: HTTP ' + r.status);
  listsReady = true;
}
async function listsOf(email) {
  await ensureLists();
  const filter = encodeURIComponent(`PartitionKey eq '${keyPart(email)}'`);
  const r = await table('GET', `/lists()?$filter=${filter}`, { resource: '/lists()' });
  if (!r.ok) throw new Error('Listen lesen: HTTP ' + r.status);
  return ((await r.json()).value || [])
    .map(x => ({ name: x.name, words: JSON.parse(x.words || '[]'), updated: x.updated }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
async function saveList(email, name, words) {
  await ensureLists();
  const pk = keyPart(email), rk = keyPart(name.toLowerCase());
  const r = await table('PUT', listEntity(pk, rk), { // ohne If-Match = anlegen oder ersetzen
    body: { PartitionKey: pk, RowKey: rk, name, words: JSON.stringify(words), updated: new Date().toISOString() }
  });
  if (!r.ok) throw new Error('Liste speichern: HTTP ' + r.status);
}
async function removeList(email, name) {
  await ensureLists();
  const r = await table('DELETE', listEntity(keyPart(email), keyPart(name.toLowerCase())), { extra: { 'If-Match': '*' } });
  if (!r.ok && r.status !== 404) throw new Error('Liste löschen: HTTP ' + r.status);
}

/* ---------- Mail (Azure Communication Services Email) ---------- */
async function sendMail(to, subject, text, html) {
  const host = new URL(env.ACS_ENDPOINT).host;
  const pq = '/emails:send?api-version=2023-03-31';
  const body = JSON.stringify({
    senderAddress: env.MAIL_SENDER,
    recipients: { to: [{ address: to }] },
    content: { subject, plainText: text, html }
  });
  const date = new Date().toUTCString();
  const hash = crypto.createHash('sha256').update(body).digest('base64');
  const sig = hmac(Buffer.from(env.ACS_KEY, 'base64'), `POST\n${pq}\n${date};${host};${hash}`, 'base64');
  const r = await fetch(`https://${host}${pq}`, {
    method: 'POST',
    headers: {
      'x-ms-date': date, 'x-ms-content-sha256': hash,
      Authorization: `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${sig}`,
      'Content-Type': 'application/json'
    },
    body
  });
  if (r.status !== 202) throw new Error('Mail senden: HTTP ' + r.status);
}

/* ---------- Passwort ---------- */
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, (e, k) => e ? rej(e) : res(k)));
async function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  return salt.toString('hex') + ':' + (await scrypt(pw, salt)).toString('hex');
}
async function checkPw(pw, stored) {
  const [s, h] = stored.split(':');
  const k = await scrypt(pw, Buffer.from(s, 'hex'));
  const hb = Buffer.from(h, 'hex');
  return hb.length === k.length && crypto.timingSafeEqual(hb, k);
}
const DUMMY_HASH = '00'.repeat(16) + ':' + '00'.repeat(64); // gleiche Rechenzeit, wenn der Nutzer nicht existiert

/* ---------- Session (signiertes Cookie) ---------- */
const COOKIE = 'ls';
const MAX_AGE = 7 * 24 * 3600;
function sessionCookie(email) {
  const p = Buffer.from(JSON.stringify({ e: email, x: Date.now() + MAX_AGE * 1000 })).toString('base64url');
  return `${COOKIE}=${p}.${hmac(env.SESSION_SECRET, p, 'base64url')}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}
const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
function sessionEmail(req) {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || '');
  if (!m) return null;
  const [p, s] = m[1].split('.');
  if (!p || !s) return null;
  const expect = hmac(env.SESSION_SECRET, p, 'base64url');
  if (expect.length !== s.length || !crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(s))) return null;
  try {
    const d = JSON.parse(Buffer.from(p, 'base64url').toString());
    return d.x > Date.now() ? d.e : null;
  } catch { return null; }
}
// Gültige Session UND Konto noch freigegeben → E-Mail, sonst null
async function requireUser(req) {
  const email = sessionEmail(req);
  if (!email) return null;
  const u = await getUser(email);
  return u && u.status === 'approved' ? email : null;
}

/* ---------- Sonstiges ---------- */
const EMAIL_RE = /^[^\s@'"<>\\]+@[^\s@'"<>\\]+\.[^\s@'"<>\\]+$/;
const normEmail = e => String(e || '').trim().toLowerCase();
const validEmail = e => e.length <= 254 && EMAIL_RE.test(e);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (status, obj, headers) => ({
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }, body: obj
});
const page = (status, title, inner) => ({
  status,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  body: `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>` +
    `<body style="font-family:system-ui;max-width:480px;margin:12vh auto;padding:16px"><h1>${esc(title)}</h1>${inner}</body></html>`
});

module.exports = {
  env, sha256, listsOf, saveList, removeList, getUser, insertUser, replaceUser, deleteUser, sendMail, hashPw, checkPw, DUMMY_HASH,
  sessionCookie, clearCookie, requireUser, normEmail, validEmail, esc, json, page
};
