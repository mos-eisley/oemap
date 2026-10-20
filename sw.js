/* Az app teljesen önálló: egy HTML, a betűk és az ikonok. Ezeket telepítéskor
   eltesszük, így az épületben gyenge térerővel is elindul. */
/* A név cseréje dobja el a régi gyorsítótárat (activate). A v3 a régi,
   kéthetes teremadatot vitte ki — az új app más formátumot vár. A v4 egy
   esetleg eltett hibaoldalt (404, lásd a navigációs ágat) dob el: a telepítés
   frissen tölti le az appot, a régi tároló törlődik. */
const CACHE = "oemap-v4";
const SHELL = [
  /* Az épület-nyilvántartás is a telepített készlet része: nélküle az
     épületválasztó offline el sem jelenik meg. Kicsi (12 KB), és a /data/
     ágon amúgy is hálózat-először frissül. */
  "./", "./index.html", "./manifest.webmanifest", "./data/termek.json",
  "./data/epuletek.json",
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
  /* Fájlonként tesszük el, nem addAll-lal: egy hiányzó betű vagy ikon miatt ne
     bukjon el az egész telepítés. Maga az app viszont kötelező: ha az nem jön
     le (megszakadó kapcsolat egy frissítés közben), a telepítés elbukik, és a
     régi service worker a régi, működő tárolójával marad — különben egy üres
     tároló lépne a helyére, és offline semmi nem indulna. */
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(SHELL.map(u => {
      const kesz = c.add(new Request(u, {cache: "reload"}));
      return u === "./index.html" ? kesz : kesz.catch(() => {});
    })))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  /* Csak a saját régi tárolóinkat: egy github.io-s címen a felhasználó összes
     projektoldala egy origin, és a másikét nem a mi dolgunk törölni. */
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith("oemap-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  /* A dokumentum hálózat-először: egy deploy után azonnal az új verzió jön,
     offline pedig a gyorsítótárazott példány. A tárolt példány helyére csak
     maga az app kerülhet, és csak ép válaszból. Korábban minden válasz oda
     került: a Pages kikapcsolásakor a 404-oldal felülírta az appot, és utána
     offline is az jött — a totem pedig, amin a hibaoldalon nincs JS, magától
     már nem töltött volna újra. Egy másik lap (meres.html) ugyanígy átvette
     az app helyét. Ha a szerver hibát ad, a tárolt app jön. */
  if (req.mode === "navigate") {
    // az app a hatókör gyökere (pl. /oemap/) vagy annak index.html-je — más lap nem az
    const gyoker = new URL("./", self.location).pathname, ut = new URL(req.url).pathname;
    const app = ut === gyoker || ut === gyoker + "index.html";
    const tarolt = () => caches.match("./index.html").then(h => h || caches.match("./"));
    e.respondWith(
      fetch(req).then(r => {
        /* Az átirányítást a böngésző kövesse (a navigáció „manual” módú, ezért
           ez itt opaqueredirect): ha a site új címre költözik, a telepített
           app ne ragadjon a régin a tárolt példánnyal. */
        if (!app || r.type === "opaqueredirect") return r;
        if (r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put("./index.html", copy));
          return r;
        }
        return r.status >= 400 ? tarolt().then(h => h || r) : r;
      }).catch(() => tarolt())
    );
    return;
  }

  /* Az adat (foglalható termek) is hálózat-először: félévente cserélődik, a
     neve viszont ugyanaz marad. Gyorsítótár-először egy telepített app sosem
     kapná meg az új félévet; offline a tárolt példány jön. */
  if (new URL(req.url).pathname.includes("/data/")) {
    /* A tmLoad() egy régi formátumú válasz után egyedi `?v=` paraméterrel kéri
       újra: a friss példány a paraméter NÉLKÜLI kulcs alá kerül, így felülírja
       a régit, és nem gyűlnek a sosem olvasott bejegyzések. */
    const kulcs = new URL(req.url); kulcs.searchParams.delete("v");
    e.respondWith(
      fetch(req).then(r => {
        if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(kulcs.href, copy)); return r; }
        // hibaválasznál (404, 5xx) a tárolt példány, ha van — ugyanúgy, mint offline
        return caches.match(kulcs.href).then(h => h || r);
      }).catch(() => caches.match(kulcs.href))
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
