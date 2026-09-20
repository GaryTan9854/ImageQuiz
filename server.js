'use strict';
// ImageQuiz — 零依賴 node:http（Node ≥ 22.5）。
// 圖庫完全在瀏覽器端（IndexedDB），伺服器只送靜態檔 + health + 瀏覽次數。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const pkg = require('./package.json');
const PORT = parseInt(process.env.PORT || '3025', 10);
const PUBLIC = path.join(__dirname, 'public');
// 瀏覽次數 DB 放在 rsync 不會覆蓋的地方（MBP ~/db/imagequiz）
const DB_PATH = process.env.IQ_DB || path.join(os.homedir(), 'db', 'imagequiz', 'imagequiz.db');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// 惰性開啟瀏覽次數 DB（失敗就當沒有，不影響主要功能）
let db = null;
function getDb() {
  if (db !== null) return db;
  try {
    const { DatabaseSync } = require('node:sqlite');
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new DatabaseSync(DB_PATH);
    db.exec('CREATE TABLE IF NOT EXISTS visits (day TEXT PRIMARY KEY, n INTEGER)');
  } catch (e) { console.warn('visits DB unavailable:', e.message); db = false; }
  return db;
}

function json(res, obj, code = 200, extra = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = decodeURIComponent(url.pathname);

  if (p === '/api/health') {
    return json(res, { status: 'ok', app: 'ImageQuiz', version: pkg.version, build: String(pkg.build || '') },
      200, { 'Access-Control-Allow-Origin': '*' });
  }

  if (p === '/api/visit') {
    const d = getDb();
    if (!d) return json(res, { today: 0, total: 0 });
    try {
      const day = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);   // 台灣時區
      d.prepare('INSERT INTO visits (day,n) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET n=n+1').run(day);
      const t = d.prepare('SELECT n FROM visits WHERE day=?').get(day);
      const s = d.prepare('SELECT SUM(n) AS s FROM visits').get();
      return json(res, { today: t ? t.n : 0, total: (s && s.s) ? s.s : 0 });
    } catch { return json(res, { today: 0, total: 0 }); }
  }

  // 靜態檔 + SPA fallback
  let fp = path.join(PUBLIC, p);
  if (!fp.startsWith(PUBLIC)) fp = PUBLIC;
  if (p === '/' || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = path.join(PUBLIC, 'index.html');
  const ext = path.extname(fp).toLowerCase();
  const noStore = ['.html', '.js', '.css', '.json'].includes(ext);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // ★★ PWA 的圖示與 manifest 不可以吃長快取：Cloudflare 會把舊圖留住整整一天
      //    （Parasitology/histology 是七天），換了圖在手機上完全看不出來，也沒有任何錯誤。
      //    2026-09-20 踩過：TunaVocab 換成同心圓後線上還在送舊的 A。這些檔很小又少人抓。
      'Cache-Control': noStore ? 'no-store, must-revalidate'
        : /^(icon-.*\.png|pwa-manifest\.json|manifest\.json)$/.test(require('node:path').basename(fp)) ? 'no-cache'
        : 'public, max-age=86400',
    });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`ImageQuiz v${pkg.version} (build ${pkg.build}) on :${PORT}`));
