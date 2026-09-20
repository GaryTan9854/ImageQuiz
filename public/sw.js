/* PWA 殼快取（.claude/skills/pwa-app 產生，勿手改）。
   ★★ 刻意「一律先走網路，連不上才回快取」，而且只管 SHELL 那幾個路徑。
      會搶先給快取的 service worker 正是「deploy 了、版本也對、新功能就是不出現」
      那類無聲 bug 的病灶（TunaWealth 的 index.html 被 Cloudflare 留住是同一家族）。 */
const CACHE = "imagequiz-shell-v1";
const SHELL = ["/", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) =>
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())));

self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())));

self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin) return;
  if (!SHELL.includes(u.pathname)) return;              // 殼以外一律不插手
  e.respondWith(
    fetch(e.request).then((r) => {
      // ★ 被 Cloudflare Access 轉走的回應不可以進快取 —— 存進去等於把登入頁當成 app
      if (r.ok && !r.redirected && new URL(r.url).origin === self.location.origin) {
        const c = r.clone();
        caches.open(CACHE).then((k) => k.put(u.pathname, c));
      }
      return r;
    }).catch(() => caches.match(u.pathname)),
  );
});
