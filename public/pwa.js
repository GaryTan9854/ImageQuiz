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
  function show() {
    if (byId() || !evt) return;
    try { if (localStorage.getItem("pwa.install.dismissed") === "1") return; } catch (e) {}
    if (document.readyState === "loading" || !document.body)
      return addEventListener("DOMContentLoaded", show);

    var w = document.createElement("div");
    w.id = "pwaInstall";
    css(w, {
      position: "fixed", right: "14px",
      bottom: "calc(14px + env(safe-area-inset-bottom))",
      zIndex: "2147483000", display: "flex", gap: "2px", alignItems: "center",
      background: PILL_BG, color: PILL_FG, borderRadius: "999px",
      padding: "9px 8px 9px 15px", boxShadow: "0 6px 20px rgba(0,0,0,.3)",
      font: '13px/1 -apple-system,"PingFang TC",sans-serif',
    });
    var b = document.createElement("button");
    b.textContent = "安裝 App";
    css(b, { all: "unset", cursor: "pointer", font: "inherit", color: "inherit" });
    b.onclick = function () {
      if (!evt) return;
      evt.prompt();
      evt.userChoice.then(function () { evt = null; w.remove(); });
    };
    var x = document.createElement("button");
    x.textContent = "✕"; x.title = "不要再問";
    css(x, { all: "unset", cursor: "pointer", font: "inherit", color: "inherit",
             opacity: ".6", padding: "0 6px" });
    x.onclick = function () {
      try { localStorage.setItem("pwa.install.dismissed", "1"); } catch (e) {}
      w.remove();
    };
    w.appendChild(b); w.appendChild(x); document.body.appendChild(w);
  }

  if ("serviceWorker" in navigator)
    addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
})();
