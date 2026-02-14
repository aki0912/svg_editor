import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function parsePort(argv) {
  const index = argv.indexOf('--port');
  if (index >= 0 && argv[index + 1]) {
    const parsed = Number(argv[index + 1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 4173;
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js' || ext === '.mjs') return 'application/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.woff') return 'font/woff';
  if (ext === '.woff2') return 'font/woff2';
  return 'application/octet-stream';
}

function resolveSafePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const requestPath = clean === '/' ? '/index.html' : clean;
  const normalized = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
  const absolute = path.resolve(rootDir, `.${normalized}`);
  if (!absolute.startsWith(rootDir)) return null;
  return absolute;
}

const server = http.createServer((req, res) => {
  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  const filePath = resolveSafePath(req.url || '/');
  if (!filePath) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  let targetPath = filePath;
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    targetPath = path.join(targetPath, 'index.html');
  }

  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const headers = {
    'Content-Type': getContentType(targetPath),
    'Cache-Control': 'no-store',
  };
  res.writeHead(200, headers);
  if (method === 'HEAD') {
    res.end();
    return;
  }

  const stream = fs.createReadStream(targetPath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end('Internal Server Error');
  });
  stream.pipe(res);
});

const port = parsePort(process.argv);
server.listen(port, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(`e2e static server running at http://127.0.0.1:${port}`);
});
