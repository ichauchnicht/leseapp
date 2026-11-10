// Registrierung: legt das Konto als "pending" an und schickt Janine eine Freigabe-Mail.
const crypto = require('crypto');
const c = require('../lib/common');

module.exports = async function (context, req) {
  const email = c.normEmail(req.body && req.body.email);
  const password = String((req.body && req.body.password) || '');
  if (!c.validEmail(email)) return void (context.res = c.json(400, { error: 'Bitte eine gültige E-Mail-Adresse angeben.' }));
  if (password.length < 10 || password.length > 200) return void (context.res = c.json(400, { error: 'Das Passwort braucht mindestens 10 Zeichen.' }));

  try {
    const token = crypto.randomBytes(32).toString('hex');
    const result = await c.insertUser({
      PartitionKey: 'u', RowKey: email, pwHash: await c.hashPw(password),
      status: 'pending', tokenHash: c.sha256(token), created: new Date().toISOString()
    });
    if (result === 'ok') {
      const link = a => `${c.env.SITE_URL}/api/approve?e=${encodeURIComponent(email)}&t=${token}&a=${a}`;
      try {
        await c.sendMail(c.env.ADMIN_EMAIL, `Leseapp: Freigabe für ${email}`,
          `${email} möchte die Leseapp nutzen.\n\nFreigeben: ${link('approve')}\nAblehnen: ${link('reject')}\n`,
          `<p><b>${c.esc(email)}</b> möchte die Leseapp nutzen.</p>` +
          `<p><a href="${link('approve')}" style="background:#1f9d55;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">✅ Freigeben</a> &nbsp; ` +
          `<a href="${link('reject')}">Ablehnen</a></p>`);
      } catch (e) {
        await c.deleteUser(email); // sonst bliebe ein Konto ohne Freigabe-Mail zurück
        throw e;
      }
    }
    // Gleiche Antwort, auch wenn die Adresse schon existiert (keine Auskunft, wer registriert ist)
    context.res = c.json(200, { ok: true });
  } catch (e) {
    context.log.error('register: ' + e.message);
    context.res = c.json(500, { error: 'Registrierung ist gerade nicht möglich. Bitte später erneut versuchen.' });
  }
};
