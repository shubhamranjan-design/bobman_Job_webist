import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = 3001;
const API_TARGET = 'http://127.0.0.1:8000';

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const DASHBOARD_PREFIX = '/dashboard';

const server = http.createServer((req, res) => {
  // Strip /dashboard prefix if present
  if (req.url.startsWith(DASHBOARD_PREFIX)) {
    req.url = req.url.slice(DASHBOARD_PREFIX.length) || '/';
  }

  // Proxy /api requests to FastAPI backend
  if (req.url.startsWith('/api')) {
    const proxyReq = http.request(
      `${API_TARGET}${req.url}`,
      { method: req.method, headers: { ...req.headers, host: '127.0.0.1:8000' } },
      (proxyRes) => {
        // Add CORS headers for safety
        res.writeHead(proxyRes.statusCode, {
          ...proxyRes.headers,
          'access-control-allow-origin': '*',
        });
        proxyRes.pipe(res);
      }
    );
    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Backend unavailable' }));
    });
    req.pipe(proxyReq);
    return;
  }

  // Serve static files from dist/
  let filePath = path.join(DIST_DIR, req.url === '/' ? 'index.html' : req.url);

  // If file doesn't exist, serve index.html (SPA fallback)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  // No cache for HTML, SW, and manifest; cache hashed assets aggressively
  const basename = path.basename(filePath);
  const noCache = ext === '.html' || basename === 'sw.js' || basename === 'registerSW.js' || ext === '.webmanifest';
  const cacheControl = noCache
    ? 'no-cache, no-store, must-revalidate'
    : 'public, max-age=31536000, immutable';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Proxying /api/* -> ${API_TARGET}/api/*`);
  console.log(`Serving static files from ${DIST_DIR}`);
});
