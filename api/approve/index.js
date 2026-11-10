// Freigabe/Ablehnung per Link aus der Mail.
// GET zeigt nur eine Bestätigungsseite (Mail-Scanner rufen Links vorab per GET auf und würden sonst
// ungewollt freigeben); erst der Klick auf den Button (POST) ändert etwas.
const crypto = require('crypto');
const c = require('../lib/common');

module.exports = async function (context, req) {
  const email = c.normEmail(req.query.e);
  const token = String(req.query.t || '');
  const action = req.query.a === 'reject' ? 'reject' : 'approve';
  const bad = () => c.page(400, 'Link ungültig', '<p>Der Link ist ungültig oder wurde schon verwendet.</p>');
  try {
    const u = c.validEmail(email) ? await c.getUser(email) : null;
    const a = Buffer.from(c.sha256(token)), b = Buffer.from((u && u.tokenHash) || '');
    if (!u || u.status !== 'pending' || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return void (context.res = bad());

    if (req.method === 'GET') {
      const label = action === 'approve' ? '✅ Freigeben' : 'Ablehnen';
      context.res = c.page(200, action === 'approve' ? 'Zugang freigeben?' : 'Zugang ablehnen?',
        `<p><b>${c.esc(email)}</b></p><form method="post"><button style="font-size:1.1rem;padding:12px 24px">${label}</button></form>`);
      return;
    }

    u.status = action === 'approve' ? 'approved' : 'rejected';
    u.tokenHash = '';
    await c.replaceUser(u);
    if (action === 'approve') {
      try {
        await c.sendMail(email, 'Leseapp: Dein Zugang ist freigegeben',
          `Dein Zugang zur Leseapp ist freigegeben. Du kannst dich jetzt anmelden: ${c.env.SITE_URL}/login.html\n`,
          `<p>Dein Zugang zur Leseapp ist freigegeben.</p><p><a href="${c.env.SITE_URL}/login.html">Jetzt anmelden</a></p>`);
      } catch (e) { context.log.error('approve-mail: ' + e.message); }
    }
    context.res = c.page(200, action === 'approve' ? 'Freigegeben ✅' : 'Abgelehnt', `<p>${c.esc(email)}</p>`);
  } catch (e) {
    context.log.error('approve: ' + e.message);
    context.res = c.page(500, 'Fehler', '<p>Das hat nicht geklappt. Bitte Link erneut öffnen.</p>');
  }
};
