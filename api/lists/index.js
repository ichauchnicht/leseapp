// Eigene Wortlisten: GET (alle), PUT {name, words} (speichern/ersetzen), DELETE ?name=… – nur für den eigenen Account.
const c = require('../lib/common');

const MAX_LISTS = 30, MAX_WORDS = 500, MAX_WORD_LEN = 40, MAX_NAME_LEN = 40;
const clean = s => String(s).replace(/[\u0000-\u001f<>]/g, '').trim();

module.exports = async function (context, req) {
  try {
    const email = await c.requireUser(req);
    if (!email) return void (context.res = c.json(401, { error: 'Nicht angemeldet' }));

    if (req.method === 'GET') {
      context.res = c.json(200, { lists: await c.listsOf(email) });
      return;
    }

    if (req.method === 'PUT') {
      const name = clean((req.body && req.body.name) || '');
      const words = Array.isArray(req.body && req.body.words) ? req.body.words.map(clean).filter(Boolean) : [];
      if (!name || name.length > MAX_NAME_LEN) return void (context.res = c.json(400, { error: `Name: 1–${MAX_NAME_LEN} Zeichen.` }));
      if (!words.length || words.length > MAX_WORDS || words.some(w => w.length > MAX_WORD_LEN))
        return void (context.res = c.json(400, { error: `Liste: 1–${MAX_WORDS} Wörter, je höchstens ${MAX_WORD_LEN} Zeichen.` }));
      const existing = await c.listsOf(email);
      const isNew = !existing.some(l => l.name.toLowerCase() === name.toLowerCase());
      if (isNew && existing.length >= MAX_LISTS) return void (context.res = c.json(400, { error: `Höchstens ${MAX_LISTS} Listen.` }));
      await c.saveList(email, name, words);
      context.res = c.json(200, { ok: true, replaced: !isNew });
      return;
    }

    if (req.method === 'DELETE') {
      const name = clean(req.query.name || '');
      if (!name) return void (context.res = c.json(400, { error: 'Name fehlt.' }));
      await c.removeList(email, name);
      context.res = c.json(200, { ok: true });
    }
  } catch (e) {
    context.log.error('lists: ' + e.message);
    context.res = c.json(500, { error: 'Listen sind gerade nicht erreichbar.' });
  }
};
