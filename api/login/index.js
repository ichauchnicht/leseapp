const c = require('../lib/common');

module.exports = async function (context, req) {
  const email = c.normEmail(req.body && req.body.email);
  const password = String((req.body && req.body.password) || '').slice(0, 200);
  try {
    const u = c.validEmail(email) ? await c.getUser(email) : null;
    const ok = await c.checkPw(password, u ? u.pwHash : c.DUMMY_HASH); // immer rechnen → gleiche Antwortzeit
    if (!u || !ok) return void (context.res = c.json(401, { error: 'E-Mail oder Passwort stimmt nicht.' }));
    if (u.status !== 'approved') {
      return void (context.res = c.json(403, { error: u.status === 'pending'
        ? 'Dein Zugang wurde noch nicht freigegeben. Janine hat eine Anfrage bekommen.'
        : 'Dein Zugang wurde abgelehnt.' }));
    }
    context.res = c.json(200, { ok: true, email }, { 'Set-Cookie': c.sessionCookie(email) });
  } catch (e) {
    context.log.error('login: ' + e.message);
    context.res = c.json(500, { error: 'Anmeldung ist gerade nicht möglich.' });
  }
};
