// import http from 'http';
// import path from 'path';
// import fs from 'fs';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../../'); // monorepo 根
const BASE = 'packages/router/html-test/csr';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let reqPath = url.pathname;

  let filePath = path.join(ROOT, reqPath);
  if (reqPath.endsWith('/')) {
    filePath = path.join(filePath, 'index.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (!err) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
      return;
    }

    // SPA fallback: 返回 index.html
    fs.readFile(path.join(ROOT, BASE, 'index.html'), (err2, indexData) => {
      if (err2) { res.writeHead(404); res.end('Not Found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(indexData);
    });
  });
});

const PORT = 8888;
server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
