/* PWA 接線（.claude/skills/pwa-app 產生，勿手改）：狀態列顏色、安裝鈕、service worker。
   ★★ 這段刻意「不是」行內 script —— TunaSpend 的 CSP 是 script-src 'self'（沒有 unsafe-inline），
      寫在 index.html 裡會被整個擋掉，而且沒有任何畫面上的徵兆。外部檔每一站都過得了。
   ★ 同理按鈕樣式用 el.style.xxx 逐個賦值，不用 setAttribute('style', ...) ——
      CSP 的 style-src 管得到 style 屬性，管不到 CSSOM。 */
(function () {
  "use strict";
  var THEME_VAR = "", PILL_BG = "#1e293b", PILL_FG = "#ffffff";

  // ── 狀態列顏色跟著主題走（裝成 app 後 iOS 吃的就是這個值）
  function sync() {
    if (!THEME_VAR) return;
    try {
      var m = document.getElementById("pwaTheme"); if (!m) return;
      var c = getComputedStyle(document.documentElement).getPropertyValue(THEME_VAR).trim();
      if (c) m.setAttribute("content", c);
    } catch (e) {}
  }
  sync();
  addEventListener("DOMContentLoaded", sync);
  try {
    new MutationObserver(sync).observe(document.documentElement,
      { attributes: true, attributeFilter: ["data-theme", "class"] });
  } catch (e) {}

  // ── 安裝鈕。它出不出現＝瀏覽器認不認這站可安裝，比任何推測都準。
  var evt = null;
  addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); evt = e; show(); });
  addEventListener("appinstalled", function () { evt = null; var b = byId(); if (b) b.remove(); });
  function byId() { return document.getElementById("pwaInstall"); }

  function css(el, o) { for (var k in o) el.style[k] = o[k]; }
  /** 右下角那顆膠囊：內容由呼叫端塞；✕ 會記住「不要再問」（key 各自分開）。 */
  function pill(dismissKey) {
    var w = document.createElement("div");
    w.id = "pwaInstall";
    css(w, {
      position: "fixed", right: "14px", left: "auto", maxWidth: "calc(100vw - 28px)",
      bottom: "calc(14px + env(safe-area-inset-bottom))",
      zIndex: "2147483000", display: "flex", gap: "4px", alignItems: "center",
      background: PILL_BG, color: PILL_FG, borderRadius: "999px",
      padding: "9px 8px 9px 15px", boxShadow: "0 6px 20px rgba(0,0,0,.3)",
      font: '13px/1.3 -apple-system,"PingFang TC",sans-serif',
    });
    var x = document.createElement("button");
    x.textContent = "✕"; x.title = "不要再問";
    css(x, { all: "unset", cursor: "pointer", font: "inherit", color: "inherit",
             opacity: ".6", padding: "0 6px", flex: "none" });
    x.onclick = function () {
      try { localStorage.setItem(dismissKey, "1"); } catch (e) {}
      w.remove();
    };
    return { box: w, close: x };
  }
  function dismissed(key) { try { return localStorage.getItem(key) === "1"; } catch (e) { return false; } }
  function whenBody(fn) {
    if (document.readyState === "loading" || !document.body) addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function show() {
    if (byId() || !evt || dismissed("pwa.install.dismissed")) return;
    whenBody(function () {
      if (byId() || !evt) return;
      var p = pill("pwa.install.dismissed");
      var b = document.createElement("button");
      b.textContent = "安裝 App";
      css(b, { all: "unset", cursor: "pointer", font: "inherit", color: "inherit" });
      b.onclick = function () {
        if (!evt) return;
        evt.prompt();
        evt.userChoice.then(function () { evt = null; p.box.remove(); });
      };
      p.box.appendChild(b); p.box.appendChild(p.close); document.body.appendChild(p.box);
    });
  }

  // ── iPhone／iPad：★★ 蘋果規定 iOS 上**所有**瀏覽器（連 Chrome）都用 WebKit，
  //    沒有一個會發 beforeinstallprompt ⇒ 上面那顆鈕在 iOS 永遠不會出現，
  //    而使用者也不會知道要去哪裡按（2026-09-21 Gary 太太的 iPhone 上：「我沒看到可以變成 App 的按鍵」）。
  //    iOS 唯一的安裝路徑是「分享 → 加入主畫面」，所以改成提示那一步。
  var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
              (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);   // iPadOS 會裝成 Mac
  var installed = navigator.standalone === true ||
                  (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
  if (isIOS && !installed && !dismissed("pwa.ios.dismissed")) {
    whenBody(function () {
      if (byId()) return;
      var p = pill("pwa.ios.dismissed");
      var t = document.createElement("span");
      t.appendChild(document.createTextNode("裝成 App：點 "));
      // iOS 的「分享」圖示（方框＋向上箭頭）；用 DOM 建，不走 innerHTML（CSP）
      var NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "15"); svg.setAttribute("height", "15");
      svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "2.2");
      svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round");
      ["M12 3v12", "M8 7l4-4 4 4", "M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"].forEach(function (d) {
        var path = document.createElementNS(NS, "path"); path.setAttribute("d", d); svg.appendChild(path);
      });
      css(svg, { verticalAlign: "-2px", margin: "0 1px" });
      t.appendChild(svg);
      t.appendChild(document.createTextNode(" 再選「加入主畫面」"));
      p.box.appendChild(t); p.box.appendChild(p.close); document.body.appendChild(p.box);
    });
  }

  if ("serviceWorker" in navigator)
    addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
})();
