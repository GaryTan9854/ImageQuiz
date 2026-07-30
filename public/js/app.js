'use strict';
/* ImageQuiz — 圖片抽考機
   使用者上傳「已命名好資料夾」的圖庫 → 分類/答案自動成形 → 瀏覽 + 四選一抽考。
   圖片全程留在瀏覽器（IndexedDB），不上傳伺服器。風格與互動沿用 Parasitology。 */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const UNCAT = '未分類';
const IMG_RE = /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif|avif|svg)$/i;

// ── 主題（深/淺色）──────────────────────────────────────────
const SUN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
function currentTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
function applyThemeBtn() { $('themeBtn').innerHTML = currentTheme() === 'dark' ? SUN : MOON; }
function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('iq_theme', next); } catch (e) {}
  applyThemeBtn();
}

// ── IndexedDB（記住上次的圖庫，免得每次都要重新上傳）─────────
const IDB = (() => {
  const NAME = 'imagequiz', VER = 1, STORE = 'images', META = 'meta';
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const rq = indexedDB.open(NAME, VER);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        if (!d.objectStoreNames.contains(META)) d.createObjectStore(META, { keyPath: 'key' });
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
    return dbp;
  }
  const tx = async (store, mode, fn) => {
    const d = await open();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const rq = fn(t.objectStore(store));
      t.oncomplete = () => resolve(rq && rq.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  };
  return {
    async save(root, images) {
      await tx(STORE, 'readwrite', (s) => { s.clear(); images.forEach((im) => s.add({ cat: im.cat, answer: im.answer, name: im.name, blob: im.blob })); });
      await tx(META, 'readwrite', (s) => s.put({ key: 'lib', root, count: images.length, savedAt: new Date().toISOString() }));
    },
    meta() { return tx('meta', 'readonly', (s) => s.get('lib')).catch(() => null); },
    all() { return tx(STORE, 'readonly', (s) => s.getAll()).catch(() => []); },
    async clear() {
      await tx(STORE, 'readwrite', (s) => s.clear());
      await tx(META, 'readwrite', (s) => s.clear());
    },
  };
})();

// ── 圖庫模型 ────────────────────────────────────────────────
let LIB = null;      // { root, images:[{cat,answer,name,blob,url}], cats:{name:{items:[],answers:Set}} }
let PENDING = null;  // 上傳解析完、按「開始使用」前的暫存

function baseName(fileName) {
  const raw = fileName.replace(/\.[^/.]+$/, '');
  return raw.replace(/[\s_(\-]*\d+[)\]]*$/, '').trim() || raw;
}

function parseFiles(fileList) {
  const images = [];
  let root = '';
  for (const f of fileList) {
    const rel = f.webkitRelativePath || f.name;
    if (f.name.startsWith('.') || rel.includes('__MACOSX')) continue;              // macOS 隱藏檔 / 壓縮殘骸
    if (!((f.type || '').startsWith('image/') || IMG_RE.test(f.name))) continue;
    const parts = rel.split('/');
    if (!root && parts.length > 1) root = parts[0];
    const rest = parts.length > 1 ? parts.slice(1) : parts;                        // 去掉最外層資料夾
    let cat, answer;
    if (rest.length >= 3) { cat = rest[0]; answer = rest[1]; }                     // 分類/答案/…/檔名
    else if (rest.length === 2) { cat = UNCAT; answer = rest[0]; }                 // 答案/檔名
    else { cat = UNCAT; answer = baseName(f.name); }                               // 檔名即答案
    images.push({ cat, answer, name: f.name, blob: f });
  }
  return { root: root || '圖庫', images };
}

function buildLib(root, images) {
  const cats = {};
  for (const im of images) {
    im.url = URL.createObjectURL(im.blob);
    if (!cats[im.cat]) cats[im.cat] = { items: [], answers: new Set() };
    cats[im.cat].items.push(im);
    cats[im.cat].answers.add(im.answer);
  }
  return { root, images, cats };
}

const catNames = () => Object.keys(LIB.cats).sort((a, b) => a.localeCompare(b, 'zh-Hant'));

// ── 首頁 ────────────────────────────────────────────────────
function renderHome() {
  const has = !!LIB;
  const cards = [
    { route: 'setup', icon: '📂', title: '上傳資料夾', desc: has ? '換一份圖庫，或補上新的圖' : '選一個整理好的資料夾，變成你的題庫', on: true },
    { route: 'browse', icon: '🔍', title: '瀏覽圖庫', desc: '依分類看每個答案下的所有圖片', on: has },
    { route: 'quiz', icon: '🎮', title: '圖片抽考', desc: '看圖辨識，四選一小遊戲', on: has },
  ];
  $('homeGrid').innerHTML = cards.map((c) => `
    <button class="home-card" ${c.on ? 'data-cursor' : 'disabled'} data-route="${c.route}">
      <div class="hc-icon">${c.icon}</div>
      <div class="hc-title">${c.title}</div>
      <div class="hc-desc">${esc(c.desc)}</div>
    </button>`).join('');
  $('homeGrid').querySelectorAll('[data-route]').forEach((b) => {
    b.onclick = () => { if (!b.disabled) location.hash = '#' + b.dataset.route; };
  });

  if (has) {
    const nCat = catNames().length, nAns = new Set(LIB.images.map((i) => i.answer)).size;
    $('libBar').innerHTML = `目前圖庫：<b>${esc(LIB.root)}</b> — ${LIB.images.length} 張圖 · ${nAns} 個答案 · ${nCat} 個分類
      <br><button class="linkbtn" data-cursor id="clearLib">清除這份圖庫</button>`;
    $('clearLib').onclick = async () => {
      if (!confirm('確定要清除目前圖庫嗎？（下次要重新上傳資料夾）')) return;
      await IDB.clear();
      LIB.images.forEach((im) => URL.revokeObjectURL(im.url));
      LIB = null;
      renderHome();
    };
  } else {
    $('libBar').innerHTML = '還沒有圖庫。先上傳一個資料夾吧！';
  }
  if (window.TunaCursor) TunaCursor.reset();
}

// ── 上傳 ────────────────────────────────────────────────────
function initSetup() {
  const input = $('folderInput'), label = $('uploadLabel'), text = $('uploadText');
  const count = $('fileCount'), start = $('startBtn');

  label.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };

  input.onchange = () => {
    const parsed = parseFiles(input.files);
    if (!parsed.images.length) {
      PENDING = null;
      label.classList.remove('loaded');
      text.textContent = '📂 點這裡選擇資料夾';
      count.textContent = '⚠️ 這個資料夾裡找不到圖片檔，請確認結構。';
      start.disabled = true;
      return;
    }
    PENDING = parsed;
    const cats = new Set(parsed.images.map((i) => i.cat));
    const answers = new Set(parsed.images.map((i) => i.answer));
    label.classList.add('loaded');
    text.textContent = `📁 已讀取「${parsed.root}」`;
    count.textContent = `${parsed.images.length} 張圖 · ${answers.size} 個答案 · ${cats.size} 個分類`;
    start.disabled = false;
    if (window.TunaCursor) TunaCursor.set(start);
  };

  start.onclick = async () => {
    if (!PENDING) return;
    start.disabled = true;
    start.textContent = '處理中…';
    if (LIB) LIB.images.forEach((im) => URL.revokeObjectURL(im.url));
    LIB = buildLib(PENDING.root, PENDING.images);
    try { await IDB.save(PENDING.root, PENDING.images); }
    catch (e) { console.warn('IndexedDB save failed:', e); count.textContent += '（瀏覽器空間不足，這次不會被記住）'; }
    PENDING = null;
    start.textContent = '開始使用';
    start.disabled = false;
    location.hash = '#browse';
  };
}

// ── 瀏覽 ────────────────────────────────────────────────────
let browseCat = null;

function renderBrowse() {
  const cats = catNames();
  if (!browseCat || !LIB.cats[browseCat]) browseCat = cats[0];
  $('catList').innerHTML = cats.map((c) => `
    <button class="cat-item ${c === browseCat ? 'on' : ''}" data-cursor data-cat="${esc(c)}">
      <span>${esc(c)}</span><span class="n">${LIB.cats[c].items.length}</span>
    </button>`).join('');
  $('catList').querySelectorAll('[data-cat]').forEach((b) => {
    b.onclick = () => { browseCat = b.dataset.cat; renderBrowse(); };
  });

  const items = LIB.cats[browseCat].items;
  const grouped = {};
  items.forEach((im) => { (grouped[im.answer] = grouped[im.answer] || []).push(im); });
  const answers = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'zh-Hant'));

  $('browseCrumb').textContent = `${LIB.root} › ${browseCat} — ${answers.length} 個答案 · ${items.length} 張圖`;
  $('gallery').innerHTML = answers.map((ans) => `
    <section class="group">
      <h2 class="group-title">${esc(ans)} <span style="color:var(--muted);font-weight:400;font-size:13px">（${grouped[ans].length} 張）</span></h2>
      <div class="group-grid">
        ${grouped[ans].map((im, i) => `
          <button class="thumb" data-cursor data-ans="${esc(ans)}" data-i="${i}">
            <img src="${im.url}" alt="${esc(ans)}" loading="lazy">
            <figcaption>${esc(im.name)}</figcaption>
          </button>`).join('')}
      </div>
    </section>`).join('');

  $('gallery').querySelectorAll('.thumb').forEach((b) => {
    b.onclick = () => openLightbox(grouped[b.dataset.ans], Number(b.dataset.i));
  });
  if (window.TunaCursor) TunaCursor.reset();
}

// ── Lightbox（← → 換圖，ESC 關閉）───────────────────────────
let lbGroup = [], lbIdx = 0, lbEl = null;

function openLightbox(group, idx) {
  lbGroup = group; lbIdx = idx;
  lbEl = document.createElement('div');
  lbEl.className = 'lightbox';
  lbEl.innerHTML = `<img alt=""><div class="lb-cap"></div>
    <button class="lb-nav lb-prev" aria-label="上一張">‹</button>
    <button class="lb-nav lb-next" aria-label="下一張">›</button>`;
  lbEl.onclick = (e) => { if (!e.target.closest('.lb-nav')) closeLightbox(); };
  lbEl.querySelector('.lb-prev').onclick = (e) => { e.stopPropagation(); navLightbox(-1); };
  lbEl.querySelector('.lb-next').onclick = (e) => { e.stopPropagation(); navLightbox(1); };
  document.body.appendChild(lbEl);
  paintLightbox();
  if (window.TunaCursor) TunaCursor.pushEsc(closeLightbox);
}
function paintLightbox() {
  const im = lbGroup[lbIdx];
  lbEl.querySelector('img').src = im.url;
  lbEl.querySelector('.lb-cap').textContent =
    `${im.answer} — ${im.cat} · ${im.name}${lbGroup.length > 1 ? `　(${lbIdx + 1}/${lbGroup.length})` : ''}`;
}
function navLightbox(d) {
  if (!lbEl || lbGroup.length < 2) return;
  lbIdx = (lbIdx + d + lbGroup.length) % lbGroup.length;
  paintLightbox();
}
function closeLightbox() {
  if (!lbEl) return;
  lbEl.remove(); lbEl = null;
  if (window.TunaCursor) { TunaCursor.popEsc(); TunaCursor.reset(); }
}

// ── 抽考 ────────────────────────────────────────────────────
const ROUNDS = [10, 20, 30, 0];       // 0 = 無限
let scope = null;                      // Set of category names
let rounds = 10;
let pool = [], qIdx = 0, asked = 0, correct = 0, cur = null, answered = false, wrongs = [];

function renderQuizSetup() {
  const cats = catNames();
  if (!scope) scope = new Set(cats);
  [...scope].forEach((c) => { if (!LIB.cats[c]) scope.delete(c); });

  $('scopeBoxes').innerHTML = cats.map((c) => `
    <label class="catchk ${scope.has(c) ? 'on' : ''}" data-cursor data-cat="${esc(c)}">
      <input type="checkbox" ${scope.has(c) ? 'checked' : ''}>
      <span>${esc(c)}</span>
      <span class="n">${LIB.cats[c].answers.size} 答案 / ${LIB.cats[c].items.length} 圖</span>
    </label>`).join('');
  $('scopeBoxes').querySelectorAll('[data-cat]').forEach((l) => {
    l.querySelector('input').onchange = (e) => {
      e.target.checked ? scope.add(l.dataset.cat) : scope.delete(l.dataset.cat);
      l.classList.toggle('on', e.target.checked);
      updatePoolInfo();
    };
    // TunaCursor 的 Enter 會 click <label>，瀏覽器會轉給內層 checkbox，不需另外處理
  });

  $('toggleAll').onclick = () => {
    const all = scope.size === cats.length;
    scope = all ? new Set() : new Set(cats);
    renderQuizSetup();
  };
  $('toggleAll').textContent = scope.size === cats.length ? '全不選' : '全選';

  $('rounds').innerHTML = ROUNDS.map((r) => `
    <button type="button" class="chip ${r === rounds ? 'on' : ''}" data-cursor data-r="${r}">${r === 0 ? '無限' : r + ' 題'}</button>`).join('');
  $('rounds').querySelectorAll('[data-r]').forEach((b) => {
    b.onclick = () => { rounds = Number(b.dataset.r); renderQuizSetup(); };
  });

  updatePoolInfo();
  $('quizStartBtn').onclick = startQuiz;
  if (window.TunaCursor) TunaCursor.reset();
}

function scopeItems() {
  let out = [];
  scope.forEach((c) => { if (LIB.cats[c]) out = out.concat(LIB.cats[c].items); });
  return out;
}
function updatePoolInfo() {
  const items = scopeItems();
  const answers = new Set(items.map((i) => i.answer));
  const ok = answers.size >= 4;
  $('poolInfo').innerHTML = ok
    ? `題庫：${items.length} 張圖 · ${answers.size} 個答案`
    : `⚠️ 選取範圍只有 ${answers.size} 個答案，四選一至少需要 4 個。請多勾幾個分類。`;
  $('quizStartBtn').disabled = !ok;
}

function startQuiz() {
  pool = scopeItems();
  if (new Set(pool.map((i) => i.answer)).size < 4) return;
  qIdx = 0; asked = 0; correct = 0; wrongs = [];
  $('quizSetup').classList.add('hidden');
  $('result').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('endBtn').classList.toggle('hidden', !!rounds);      // 無限模式才需要「結束」鈕
  nextQuestion();
}

function nextQuestion() {
  if (rounds && qIdx >= rounds) return showResult();
  qIdx++;
  answered = false;
  cur = pool[Math.floor(Math.random() * pool.length)];

  $('progress').textContent = rounds ? `第 ${qIdx} / ${rounds} 題` : `第 ${qIdx} 題`;
  $('catBadge').textContent = cur.cat;
  $('score').textContent = `${correct} 分`;
  $('feedback').textContent = '';
  $('feedback').className = 'feedback';
  $('nextBtn').classList.add('hidden');

  $('imgwrap').innerHTML = `<img src="${cur.url}" alt="題目圖片">`;
  const img = $('imgwrap').querySelector('img');
  img.onerror = () => {
    $('imgwrap').innerHTML = `<div class="broken">⚠️ 這張圖瀏覽器讀不出來<br>（${esc(cur.name)}）<br>HEIC 只有 Safari 支援，建議先轉成 JPEG</div>`;
  };
  $('imgwrap').onclick = () => { if (img.naturalWidth) openLightbox([cur], 0); };

  renderChoices();
}

function renderChoices() {
  const sameCat = [...LIB.cats[cur.cat].answers].filter((a) => a !== cur.answer);
  shuffle(sameCat);
  let wrong = sameCat.slice(0, 3);
  if (wrong.length < 3) {                                  // 同分類不夠 → 從其他選取分類補
    const others = new Set();                              // 用 Set 去重：不同分類可能有同名答案
    scope.forEach((c) => {
      if (!LIB.cats[c]) return;
      LIB.cats[c].answers.forEach((a) => { if (a !== cur.answer && !wrong.includes(a)) others.add(a); });
    });
    wrong = wrong.concat(shuffle([...others]).slice(0, 3 - wrong.length));
  }
  const opts = shuffle([cur.answer, ...wrong]);

  $('choices').innerHTML = opts.map((o, i) => `
    <button class="opt" data-cursor data-ans="${esc(o)}"><span class="num">${i + 1}</span><span>${esc(o)}</span></button>`).join('');
  $('choices').querySelectorAll('.opt').forEach((b) => { b.onclick = () => answer(b.dataset.ans, b); });
  if (window.TunaCursor) TunaCursor.reset();
}

function answer(picked, btn) {
  if (answered) return;
  answered = true;
  const btns = $('choices').querySelectorAll('.opt');
  btns.forEach((b) => { b.disabled = true; });

  asked++;

  if (picked === cur.answer) {
    correct++;
    btn.classList.add('correct');
    $('feedback').textContent = '✅ 答對了！';
    $('feedback').className = 'feedback ok';
  } else {
    btn.classList.add('wrong');
    btns.forEach((b) => { if (b.dataset.ans === cur.answer) b.classList.add('correct'); });
    $('feedback').textContent = `❌ 正解：${cur.answer}`;
    $('feedback').className = 'feedback no';
    wrongs.push({ img: cur, picked });
  }
  $('score').textContent = `${correct} 分`;
  $('nextBtn').classList.remove('hidden');
  $('nextBtn').textContent = (rounds && qIdx >= rounds) ? '看成績 →' : '下一題 →';
  if (window.TunaCursor) TunaCursor.set($('nextBtn'));
}

function showResult() {
  $('game').classList.add('hidden');
  $('endBtn').classList.add('hidden');
  $('result').classList.remove('hidden');
  const done = asked;
  const pct = done ? Math.round((correct / done) * 100) : 0;
  $('resultTitle').textContent = pct >= 90 ? '🏆 太強了！' : pct >= 70 ? '👍 不錯喔' : pct >= 50 ? '🙂 再練練' : '💪 多看幾遍';
  $('finalScore').textContent = `${correct} / ${done}　(${pct}%)`;
  $('review').innerHTML = wrongs.length
    ? `<div style="color:var(--muted);font-size:13px">答錯的 ${wrongs.length} 題：</div>` + wrongs.map((w) => `
      <div class="rev-card">
        <img src="${w.img.url}" alt="">
        <div class="rev-body">
          <div class="rev-ans">✔ ${esc(w.img.answer)}</div>
          <div class="rev-your">✘ 你選了 ${esc(w.picked)}</div>
          <div class="rev-cat">${esc(w.img.cat)} · ${esc(w.img.name)}</div>
        </div>
      </div>`).join('')
    : '<div style="color:var(--green);text-align:center;font-weight:700">全部答對，完美！</div>';
  $('againBtn').onclick = () => {
    $('result').classList.add('hidden');
    $('quizSetup').classList.remove('hidden');
    renderQuizSetup();
  };
  if (window.TunaCursor) TunaCursor.reset();
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ── 路由 ────────────────────────────────────────────────────
const VIEWS = ['home', 'setup', 'browse', 'quiz'];

function router() {
  let route = (location.hash || '#home').slice(1) || 'home';
  if (!VIEWS.includes(route)) route = 'home';
  if ((route === 'browse' || route === 'quiz') && !LIB) route = 'setup';

  VIEWS.forEach((v) => $('view-' + v).classList.toggle('hidden', v !== route));
  document.body.dataset.route = route;
  $('homeBtn').classList.toggle('hidden', route === 'home');

  if (route === 'home') renderHome();
  if (route === 'browse') renderBrowse();
  if (route === 'quiz') {
    $('game').classList.add('hidden');
    $('result').classList.add('hidden');
    $('quizSetup').classList.remove('hidden');
    renderQuizSetup();
  }
  if (route === 'setup' && window.TunaCursor) TunaCursor.reset();
  window.scrollTo(0, 0);
}

// ── 鍵盤：抽考的 1~4 直選（方向鍵/Enter/ESC 交給 TunaCursor）──
window.addEventListener('keydown', (e) => {
  if (lbEl) {                                        // lightbox 開著：← → 換圖（capture 前於 TunaCursor 之外處理）
    if (['ArrowLeft', 'ArrowUp'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); navLightbox(-1); }
    else if (['ArrowRight', 'ArrowDown'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); navLightbox(1); }
    return;
  }
  if (document.body.dataset.route !== 'quiz' || $('game').classList.contains('hidden')) return;
  if (['1', '2', '3', '4'].includes(e.key) && !answered) {
    const btns = $('choices').querySelectorAll('.opt');
    const b = btns[Number(e.key) - 1];
    if (b) { e.preventDefault(); TunaCursor.set(b); b.click(); }
  }
}, true);

// ── boot ────────────────────────────────────────────────────
(async function boot() {
  applyThemeBtn();
  $('themeBtn').onclick = toggleTheme;
  $('brand').onclick = () => { location.hash = '#home'; };
  $('brand').onkeydown = (e) => { if (e.key === 'Enter') location.hash = '#home'; };
  $('homeBtn').onclick = () => { location.hash = '#home'; };
  $('nextBtn').onclick = () => { (rounds && qIdx >= rounds) ? showResult() : nextQuestion(); };
  $('endBtn').onclick = () => showResult();
  initSetup();

  fetch('/api/health').then((r) => r.json()).then((h) => { $('ver').textContent = 'v' + h.version; }).catch(() => {});
  fetch('/api/visit').then((r) => r.json())
    .then((v) => { $('visits').textContent = `今日瀏覽 ${v.today} · 累計 ${v.total}`; }).catch(() => {});

  // 還原上次的圖庫
  try {
    const meta = await IDB.meta();
    if (meta && meta.count) {
      const rows = await IDB.all();
      if (rows && rows.length) LIB = buildLib(meta.root, rows.map((r) => ({ cat: r.cat, answer: r.answer, name: r.name, blob: r.blob })));
    }
  } catch (e) { console.warn('restore failed:', e); }

  // ESC：回首頁（lightbox 開著時 TunaCursor 的 esc 堆疊會先接手）
  if (window.TunaCursor) TunaCursor.pushEsc(() => { if (location.hash !== '#home') location.hash = '#home'; });

  window.addEventListener('hashchange', router);
  router();
})();
