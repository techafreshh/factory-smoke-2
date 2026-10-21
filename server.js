// factory-smoke-2 — in-memory URL shortener in one plain-Node file (PRD.md).
const http = require('node:http');

const PORT = Number(process.env.PORT) || 8104;
const ID_RE = /^[a-z0-9]{6}$/;

const byId = new Map(); // id -> { url, hits }
const byUrl = new Map(); // url -> id (same url shortens to the same id)
let nextId = 0;

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function newId() {
  return (nextId++).toString(36).padStart(6, '0');
}

function isAbsoluteHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function readBody(req, limit = 1e6) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        resolve(null); // oversized body counts as invalid input, not a hang
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', () => resolve(null));
  });
}

function shorten(res, body) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    sendJson(res, 400, { error: 'invalid JSON body' });
    return;
  }
  const url = parsed && typeof parsed === 'object' ? parsed.url : undefined;
  if (typeof url !== 'string' || !isAbsoluteHttpUrl(url)) {
    sendJson(res, 400, { error: 'url must be an absolute http(s) URL' });
    return;
  }
  let id = byUrl.get(url);
  if (!id) {
    id = newId();
    byUrl.set(url, id);
    byId.set(id, { url, hits: 0 });
  }
  sendJson(res, 200, { code: id });
}

const server = http.createServer(async (req, res) => {
  try {
    const path = req.url.split('?')[0];
    if (req.method === 'GET' && path === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === 'POST' && path === '/shorten') {
      shorten(res, await readBody(req));
      return;
    }
    const stats = path.match(/^\/codes\/([a-z0-9]{6})$/);
    if (req.method === 'GET' && stats) {
      const entry = byId.get(stats[1]);
      if (!entry) {
        sendJson(res, 404, { error: 'unknown id' });
        return;
      }
      sendJson(res, 200, { code: stats[1], url: entry.url, hits: entry.hits });
      return;
    }
    const redirect = path.match(/^\/([a-z0-9]{6})$/);
    if (req.method === 'GET' && redirect) {
      const entry = byId.get(redirect[1]);
      if (!entry) {
        sendJson(res, 404, { error: 'unknown id' });
        return;
      }
      entry.hits += 1;
      res.writeHead(302, { Location: entry.url });
      res.end();
      return;
    }
    sendJson(res, 404, { error: 'not found' });
  } catch {
    sendJson(res, 400, { error: 'bad request' });
  }
});

server.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});
