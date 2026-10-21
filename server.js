// factory-smoke-2 — walking skeleton: plain-Node HTTP server with /health.
const http = require('node:http');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 8104;

// Process-lifetime state: dedupe (same url → same id) and reverse lookup for
// collision checks (later issues use idToUrl for redirects and hit counts).
const urlToId = new Map();
const idToUrl = new Map();

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function isValidHttpUrl(value) {
  if (typeof value !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

function generateId() {
  let id;
  do {
    id = '';
    for (let i = 0; i < 6; i++) {
      id += ID_ALPHABET[crypto.randomInt(0, ID_ALPHABET.length)];
    }
  } while (idToUrl.has(id)); // collision check against already-minted ids
  return id;
}

function handleShorten(req, res) {
  const chunks = [];
  let size = 0;
  let aborted = false; // stop processing once an error/limit response is sent

  req.on('error', () => {
    // client aborted mid-body; if nothing sent yet, close out with 400
    aborted = true;
    if (!res.writableEnded) sendJson(res, 400, { error: 'request aborted' });
  });

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > 64 * 1024) {
      aborted = true;
      sendJson(res, 413, { error: 'body too large' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (aborted) return;
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
    } catch {
      sendJson(res, 400, { error: 'invalid JSON' });
      return;
    }
    const url = body && body.url;
    if (typeof url !== 'string') {
      sendJson(res, 400, { error: 'missing url' });
      return;
    }
    if (!isValidHttpUrl(url)) {
      sendJson(res, 400, { error: 'url must be an absolute http(s) url' });
      return;
    }
    let id = urlToId.get(url);
    if (id === undefined) {
      id = generateId();
      urlToId.set(url, id);
      idToUrl.set(id, url);
    }
    sendJson(res, 200, { code: id });
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method === 'POST' && req.url === '/shorten') {
    handleShorten(req, res);
    return;
  }
  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});
