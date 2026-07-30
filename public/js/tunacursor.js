'use strict';
/* TunaCursor + TunaESC — 可重用鍵盤導覽（Gary 系統最重要原則）
   用法：任何可聚焦元素加 [data-cursor]；方向鍵幾何移動、Enter/Space 觸發 click、ESC 走 esc 堆疊。
   輸入框(input/textarea/contenteditable)內：方向鍵走原生文字游標，ESC 仍有效。 */
window.TunaCursor = (function () {
  let cur = null;
  const escStack = [];

  const visible = (el) => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    return el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
  };
  const items = () => [...document.querySelectorAll('[data-cursor]')].filter(visible);

  function setCur(el) {
    if (cur) cur.classList.remove('cursor');
    cur = el;
    if (el) { el.classList.add('cursor'); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }
  function first() {
    const l = items(); if (!l.length) return null;
    return l.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return (ra.top - rb.top) || (ra.left - rb.left);
    })[0];
  }
  function move(dir) {
    const l = items(); if (!l.length) return;
    if (!cur || !l.includes(cur)) return setCur(first());
    const c = cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    let best = null, score = Infinity;
    for (const el of l) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const dx = x - cx, dy = y - cy;
      let primary, cross;
      if (dir === 'left') { if (dx > -1) continue; primary = -dx; cross = Math.abs(dy); }
      else if (dir === 'right') { if (dx < 1) continue; primary = dx; cross = Math.abs(dy); }
      else if (dir === 'up') { if (dy > -1) continue; primary = -dy; cross = Math.abs(dx); }
      else { if (dy < 1) continue; primary = dy; cross = Math.abs(dx); }
      const s = primary + cross * 2.2;
      if (s < score) { score = s; best = el; }
    }
    if (best) setCur(best);
  }

  window.addEventListener('keydown', (e) => {
    const ae = document.activeElement;
    const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
    if (e.key === 'Escape') {
      if (escStack.length) { e.preventDefault(); escStack[escStack.length - 1](); }
      return;
    }
    if (typing) return;                       // 讓輸入框自己處理方向鍵/Enter
    if (e.key === 'ArrowLeft') { e.preventDefault(); move('left'); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); move('right'); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move('up'); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); move('down'); }
    else if (e.key === 'Enter' || e.key === ' ') { if (cur) { e.preventDefault(); cur.click(); } }
  });

  // 滑鼠移入也同步游標，鍵鼠一致
  document.addEventListener('mousemove', (e) => {
    const t = e.target.closest && e.target.closest('[data-cursor]');
    if (t && t !== cur && visible(t)) setCur(t);
  });

  return {
    reset() { setCur(null); requestAnimationFrame(() => setCur(first())); },
    focusFirst() { setCur(first()); },
    set(el) { setCur(el); },
    current() { return cur; },
    pushEsc(fn) { escStack.push(fn); },
    popEsc() { escStack.pop(); },
  };
})();
