# PRD — factory-smoke-2 (smoke #2)

An in-memory URL shortener as a single plain-Node file (`server.js`). No
dependencies, no frameworks; `node:http` only. Starts with `node server.js`,
listens on PORT from the environment (default 8104).

## Contract (probe-deterministic)
- `GET /health` → 200 with JSON body containing `"ok":true`.
- `POST /shorten` with JSON `{"url":"<absolute http(s) url>"}` → 200 with JSON
  `{"code":"<id>"}`; the id is exactly 6 lowercase alphanumeric characters
  ([a-z0-9]{6}). Shortening the same URL again returns the SAME id (the
  url→id mapping is stable for the process lifetime).
- `GET /<id>` → 302 with Location set to the stored URL; each served redirect
  records one hit for that id.
- `GET /codes/<id>` → 200 JSON `{"code","url","hits"}`; hits = redirects
  served for that id so far (process lifetime).
- Invalid input on POST /shorten (missing url field, non-absolute URL, broken
  JSON) → 4xx with a JSON error body; the process stays healthy afterwards.
- Unknown ids: `GET /<unknown>` and `GET /codes/<unknown>` → 404, prompt,
  never 5xx, never a hang.
- No persistence required (in-memory). Ten sequential redirects on one id
  must read back as hits == 10.
