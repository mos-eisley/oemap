/* Az app teljesen önálló: egy HTML, a betűk és az ikonok. Ezeket telepítéskor
   eltesszük, így az épületben gyenge térerővel is elindul. */
/* A név cseréje dobja el a régi gyorsítótárat (activate). A v3 a régi,
   kéthetes teremadatot viszi ki — az új app más formátumot vár. */
const CACHE = "oemap-v3";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./data/termek.json",
  "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/icon-maskable-192.png", "./icons/icon-maskable-512.png",
  "./fonts/metropolis-latin-400-normal.woff2",
  "./fonts/metropolis-latin-600-normal.woff2",
  "./fonts/metropolis-latin-700-normal.woff2",
  "./fonts/open-sans-latin-400-normal.woff2",
  "./fonts/open-sans-latin-600-normal.woff2",
  "./fonts/open-sans-latin-ext-400-normal.woff2",
  "./fonts/open-sans-latin-ext-600-normal.woff2",
  "./fonts/ibm-plex-mono-latin-400-normal.woff2",
  "./fonts/ibm-plex-mono-latin-600-normal.woff2",
  "./fonts/ibm-plex-mono-latin-ext-400-normal.woff2",
  "./fonts/ibm-plex-mono-latin-ext-600-normal.woff2"
];

self.addEventListener("install", e => {
  /* Fájlonként tesszük el, nem addAll-lal: az egyetlen hiányzó fájltól elbukna
     az egész telepítés, és akkor egyáltalán nem lenne offline mód. */
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(SHELL.map(u =>
      c.add(new Request(u, {cache: "reload"})).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  /* A dokumentum hálózat-először: egy deploy után azonnal az új verzió jön,
     offline pedig a gyorsítótárazott példány. */
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put("./index.html", copy));
        return r;
      }).catch(() => caches.match("./index.html").then(r => r || caches.match("./")))
    );
    return;
  }

  /* Az adat (foglalható termek) is hálózat-először: félévente cserélődik, a
     neve viszont ugyanaz marad. Gyorsítótár-először egy telepített app sosem
     kapná meg az új félévet; offline a tárolt példány jön. */
  if (new URL(req.url).pathname.includes("/data/")) {
    e.respondWith(
      fetch(req).then(r => {
        if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return r;
      }).catch(() => caches.match(req))
    );
    return;
  }

  /* Betűk és ikonok gyorsítótár-először: a nevük a tartalmukhoz kötött. */
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return r;
    }))
  );
});
