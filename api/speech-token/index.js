// Tauscht den Speech-Key (App Setting, nie im Browser) gegen ein 10-Minuten-Token.
// Nur für angemeldete, freigegebene Nutzer (Session-Cookie).
const c = require('../lib/common');

module.exports = async function (context, req) {
  const { SPEECH_KEY, SPEECH_ACCOUNT, SPEECH_REGION } = process.env;
  if (!SPEECH_KEY || !SPEECH_ACCOUNT || !SPEECH_REGION) {
    context.res = c.json(500, { error: 'Speech nicht konfiguriert' });
    return;
  }
  try {
    if (!(await c.requireUser(req))) { context.res = c.json(401, { error: 'Nicht angemeldet' }); return; }
    const r = await fetch(`https://${SPEECH_ACCOUNT}.cognitiveservices.azure.com/sts/v1.0/issueToken`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': SPEECH_KEY, 'Content-Length': '0' }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    context.res = c.json(200, { token: await r.text(), region: SPEECH_REGION });
  } catch (e) {
    context.log.error('Token-Fehler: ' + e.message);
    context.res = c.json(502, { error: 'Token-Anfrage fehlgeschlagen' });
  }
};
