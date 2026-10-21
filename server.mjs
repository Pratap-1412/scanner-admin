/**
 * Production server for the admin panel, with no dependencies: serves the built app from dist/
 * and forwards /api/v1 to the API, so the browser only talks to this origin and login cookies
 * stay first-party. Run `npm run build` first, then `npm start`.
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  /* no .env: environment only */
}

const PORT = Number(process.env.PORT || 3001);
const API = new URL(process.env.API_URL || 'http://localhost:4000');
const DIST = path.join(root, 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const SECURITY = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'X-Robots-Tag': 'noindex, nofollow',
  ...(API.protocol === 'https:' ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains' } : {}),
};

function proxy(req, res) {
  const headers = { ...req.headers, host: API.host };
  // Like the web app: pass on the visitor's address (set by the load balancer, or this connection's)
  // so the API rate-limits each admin rather than this server.
  headers['x-forwarded-for'] ??= req.socket.remoteAddress?.replace(/^::ffff:/, '');
  const client = API.protocol === 'https:' ? https : http;
  const upstream = client.request(
    { protocol: API.protocol, hostname: API.hostname, port: API.port || undefined, method: req.method, path: req.url, headers, timeout: 30_000 },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
  upstream.on('error', () => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: { code: 'INTERNAL', message: 'The server can’t be reached right now. Try again shortly.' } }));
  });
  req.pipe(upstream);
}

function serveFile(res, file, cache) {
  res.writeHead(200, { ...SECURITY, 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': cache });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://admin');
  if (url.pathname.startsWith('/api/v1/')) return proxy(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, SECURITY);
    return res.end();
  }
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('ok');
  }
  // Hashed build files are safe to cache for good; everything else falls back to the app shell.
  const file = path.join(DIST, path.normalize(decodeURIComponent(url.pathname)));
  if (file.startsWith(path.join(DIST, 'assets') + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return serveFile(res, file, 'public, max-age=31536000, immutable');
  }
  if (url.pathname.startsWith('/assets/')) {
    res.writeHead(404, SECURITY);
    return res.end();
  }
  serveFile(res, path.join(DIST, 'index.html'), 'no-cache');
});

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}
server.keepAliveTimeout = 65_000;
server.listen(PORT, () => console.log(`Admin panel on http://localhost:${PORT} (API: ${API.origin})`));
