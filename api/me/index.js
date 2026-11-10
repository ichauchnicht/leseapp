const c = require('../lib/common');
module.exports = async function (context, req) {
  try {
    const email = await c.requireUser(req);
    context.res = email ? c.json(200, { email }) : c.json(401, { error: 'Nicht angemeldet' });
  } catch (e) {
    context.log.error('me: ' + e.message);
    context.res = c.json(500, { error: 'Fehler' });
  }
};
