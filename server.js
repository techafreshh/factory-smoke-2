// factory-smoke-2 — walking skeleton: plain-Node HTTP server with /health.
const http = require('node:http');

const PORT = Number(process.env.PORT) || 8104;

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }
  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});
