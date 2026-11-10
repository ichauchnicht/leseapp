const c = require('../lib/common');
module.exports = async function (context) {
  context.res = c.json(200, { ok: true }, { 'Set-Cookie': c.clearCookie() });
};
