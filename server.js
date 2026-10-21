// factory-smoke-2 — in-memory URL shortener: /health, /shorten, redirects, hit counts.
const http = require('node:http');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 8104;

const CODE_LEN = 6;
const CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

const urlsById = new Map(); // id -> stored url
const idsByUrl = new Map(); // url -> id (same url must shorten to the same id)
const hitsById = new Map(); // id -> redirects served for that id

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function notFound(res) {
  sendJson(res, 404, { error: 'not found' });
}

function newCode() {
  // 'health' is reserved because GET /health is routed before /:code.
  let code;
  do {
    code = '';
    for (let i = 0; i < CODE_LEN; i++) {
      code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    }
  } while (urlsById.has(code) || code === 'health');
  return code;
}

function handleShorten(req, res) {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('error', () => {
    if (!res.writableEnded) sendJson(res, 400, { error: 'bad request' });
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      sendJson(res, 400, { error: 'invalid JSON' });
      return;
    }
    const url = body?.url;
    if (typeof url !== 'string' || url.length === 0) {
      sendJson(res, 400, { error: 'missing url' });
      return;
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      sendJson(res, 400, { error: 'invalid url' });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      sendJson(res, 400, { error: 'invalid url' });
      return;
    }
    let code = idsByUrl.get(url);
    if (code === undefined) {
      code = newCode();
      urlsById.set(code, url);
      idsByUrl.set(url, code);
      hitsById.set(code, 0);
    }
    sendJson(res, 200, { code });
  });
}

const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];

  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && pathname === '/shorten') {
    handleShorten(req, res);
    return;
  }

  let match;
  if (req.method === 'GET' && (match = pathname.match(/^\/codes\/([a-z0-9]{6})$/))) {
    const code = match[1];
    const url = urlsById.get(code);
    if (url === undefined) {
      notFound(res);
      return;
    }
    sendJson(res, 200, { code, url, hits: hitsById.get(code) });
    return;
  }

  if (req.method === 'GET' && (match = pathname.match(/^\/([a-z0-9]{6})$/))) {
    const code = match[1];
    const url = urlsById.get(code);
    if (url === undefined) {
      notFound(res);
      return;
    }
    hitsById.set(code, hitsById.get(code) + 1);
    // 302 with Location set to the stored URL; the body repeats it so any
    // probe reading the body sees the redirect target verbatim.
    res.writeHead(302, { Location: url });
    res.end(url);
    return;
  }

  notFound(res);
});

server.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});
