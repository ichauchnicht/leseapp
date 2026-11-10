/* Lokaler Server für die Leseapp (keine npm-Abhängigkeiten).
   - liefert die statischen Dateien aus
   - /api/speech-token: holt über Azure CLI den Key der AI-Ressource (nur im Speicher, nie auf Platte,
     nie im Browser) und tauscht ihn gegen ein kurzlebiges Speech-Token (10 Min).
   Start:  node server.js     (vorher: az login) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 8000;
const SUB = process.env.AZ_SUBSCRIPTION || 'Dataanalytics Dev';
const RG = process.env.AZ_RESOURCE_GROUP || 'JaninesLekplats';
const ACCOUNT = process.env.AZ_SPEECH_ACCOUNT || 'janinesfoundry'; // AIServices (Speech inklusive), swedencentral
const REGION = process.env.AZ_SPEECH_REGION || 'swedencentral';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };

function az(args) {
  return new Promise((resolve, reject) => {
    // shell:true nötig für az.cmd unter Windows; alle Argumente sind feste Konfigurationswerte
    const p = spawn('az', args, { shell: true });
    let out = '', err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || 'az exit ' + code)));
  });
}

let keyCache = null;
async function getKey() {
  if (!keyCache) {
    keyCache = await az(['cognitiveservices', 'account', 'keys', 'list',
      '--subscription', `"${SUB}"`, '-g', RG, '-n', ACCOUNT, '--query', 'key1', '-o', 'tsv']);
  }
  return keyCache;
}

async function issueToken() {
  const key = await getKey();
  const r = await fetch(`https://${ACCOUNT}.cognitiveservices.azure.com/sts/v1.0/issueToken`, {
    method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Length': '0' }
  });
  if (!r.ok) { if (r.status === 401) keyCache = null; throw new Error('Token-Anfrage fehlgeschlagen: HTTP ' + r.status); }
  return r.text();
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/speech-token') {
    try {
      const token = await issueToken();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ token, region: REGION }));
    } catch (e) {
      console.error(e.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  if (url.pathname === '/api/me') { // lokal ohne Login (nur 127.0.0.1)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ email: 'lokal' }));
  }
  if (url.pathname === '/api/logout') { res.writeHead(200); return res.end('{}'); }
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const WEB = path.join(__dirname, 'web');
  const file = path.resolve(WEB, rel);
  if (!file.startsWith(WEB + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Leseapp: http://localhost:${PORT}`));
