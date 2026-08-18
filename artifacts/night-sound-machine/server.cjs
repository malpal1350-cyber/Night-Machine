#!/usr/bin/env node
/**
 * Night Sound Machine — offline static server
 * CommonJS — works on Node.js 14+ with no package.json needed.
 * Usage: node server.js [port]
 */
'use strict';

var http = require('http');
var fs   = require('fs');
var path = require('path');

var DIST_DIR = path.join(__dirname, 'dist', 'public');
var PORT = Number(process.env.PORT || process.argv[2] || 8080);

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.txt':  'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav',
};

var server = http.createServer(function (req, res) {
  // Strip query string
  var urlPath = req.url.split('?')[0];
  var filePath = path.join(DIST_DIR, urlPath);

  // Prevent path traversal
  if (filePath.indexOf(DIST_DIR) !== 0) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  function tryFile(fp, fallbackToIndex) {
    fs.stat(fp, function (err, stat) {
      if (!err && stat.isFile()) {
        var ext  = path.extname(fp).toLowerCase();
        var mime = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        fs.createReadStream(fp).pipe(res);
      } else if (!err && stat.isDirectory()) {
        tryFile(path.join(fp, 'index.html'), fallbackToIndex);
      } else if (fallbackToIndex) {
        // SPA fallback — return index.html for unknown routes
        var index = path.join(DIST_DIR, 'index.html');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(index).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
  }

  tryFile(filePath, true);
});

server.listen(PORT, '127.0.0.1', function () {
  console.log('Night Sound Machine running at http://localhost:' + PORT);
  console.log('Press Ctrl+C to stop.');
});
