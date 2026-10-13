// Minimal static server: node serve.js <dir> <port> [basePath]
// basePath mimics GitHub Pages serving a repo at /<RepoName>/.
const http = require('http');
const fs = require('fs');
const path = require('path');

const [dir, port, base = ''] = process.argv.slice(2);
const root = path.resolve(dir);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain', '.wav': 'audio/wav',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (base) {
    if (!p.startsWith(base)) { res.writeHead(404); return res.end('outside base'); }
    p = p.slice(base.length) || '/';
  }
  let file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
  if (!fs.existsSync(file)) {
    const nf = path.join(root, '404.html');
    res.writeHead(404, { 'content-type': 'text/html' });
    return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'not found');
  }
  res.writeHead(200, { 'content-type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(Number(port), '127.0.0.1', () => console.log(`serving ${root} on ${port}${base}`));
