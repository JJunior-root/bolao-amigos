'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleApi, HttpError } = require('./api');
const live = require('./live');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY = 64 * 1024;

// Só estes arquivos/pastas são públicos. server/ e data/ (banco) NUNCA são servidos.
const PUBLIC_FILES = new Set(['/index.html', '/styles.css', '/admin.css']);
const PUBLIC_DIRS = ['/js/', '/assets/', '/admin/'];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'Requisição grande demais.')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'JSON inválido.')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const decoded = decodeURIComponent(pathname);
  const normalized = path.posix.normalize(decoded);
  const allowed = PUBLIC_FILES.has(normalized) || PUBLIC_DIRS.some((d) => normalized.startsWith(d));
  if (!allowed || normalized.includes('..')) return false;

  let target = path.join(ROOT, normalized);
  if (normalized.endsWith('/')) target = path.join(target, 'index.html');
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) return false;

  const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(target).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  const ip = req.socket.remoteAddress || 'desconhecido';
  try {
    if (pathname.startsWith('/api/')) {
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      const result = handleApi(req, pathname, body, ip);
      return sendJson(res, result.status, result.data, result.headers);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: 'Método não permitido.' });
    }
    if (pathname === '/admin') {
      res.writeHead(301, { Location: '/admin/' });
      return res.end();
    }
    const requested = pathname === '/' ? '/index.html' : pathname;
    if (serveStatic(req, res, requested)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Não encontrado.');
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    console.error('[erro]', req.method, pathname, err);
    return sendJson(res, 500, { error: 'Erro interno. Tente novamente.' });
  }
});

server.listen(PORT, () => {
  console.log(`Bolão amigo rodando em http://localhost:${PORT}`);
  if (live.start()) console.log('[ao-vivo] sincronização com o fornecedor ativa.');
});
