// Tiny static file server for local testing (no dependencies).
//   node serve.js          → http://localhost:8090
//   node serve.js 3000     → http://localhost:3000
// The games use ES modules, which browsers refuse to load from file:// URLs.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 8090;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.md': 'text/plain; charset=utf-8',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

http
  .createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return send(res, 400, 'Bad request');
    }
    const file = path.normalize(path.join(ROOT, urlPath));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden');

    fs.stat(file, (err, stat) => {
      if (err) return send(res, 404, 'Not found');
      if (stat.isDirectory()) {
        // Folders need a trailing slash so relative links inside them resolve.
        if (!urlPath.endsWith('/')) {
          res.writeHead(301, { Location: `${urlPath}/` });
          return res.end();
        }
        const index = path.join(file, 'index.html');
        return fs.readFile(index, (e, data) => (e ? send(res, 404, 'Not found') : send(res, 200, data, TYPES['.html'])));
      }
      fs.readFile(file, (e, data) => {
        if (e) return send(res, 500, 'Read error');
        send(res, 200, data, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
      });
    });
  })
  .listen(PORT, () => console.log(`Game Cabinet running at http://localhost:${PORT}`));
