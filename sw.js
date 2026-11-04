/* Az app teljesen önálló: egy HTML, a betűk és az ikonok. Ezeket telepítéskor
   eltesszük, így az épületben gyenge térerővel is elindul. */
/* A név cseréje dobja el a régi gyorsítótárat (activate). A v3 a régi,
   kéthetes teremadatot vitte ki — az új app más formátumot vár. A v4 egy
   esetleg eltett hibaoldalt (404, lásd a navigációs ágat) dob el: a telepítés
   frissen tölti le az appot, a régi tároló törlődik. A v5 a „./” kulcsot
   dobja el: az app egyetlen kulcsa a „./index.html”. */
const CACHE = "oemap-v5";
const SHELL = [
  /* Az épület-nyilvántartás is a telepített készlet része: nélküle az
     épületválasztó offline el sem jelenik meg. Kicsi (12 KB), és a /data/
     ágon amúgy is hálózat-először frissül. A választó térképe (helyek.json,
     28 KB) ugyanígy: nélküle a választó listákkal működik, vele térképpel. */
  /* A „./” nincs a listán: ugyanaz az app, mint a „./index.html”, és vele az
     első látogatás háromszor töltötte le a ~500 KB-os dokumentumot. */
  "./index.html", "./manifest.webmanifest", "./data/termek.json",
  "./data/epuletek.json", "./data/helyek.json",
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

/* Ennyit várunk a hálózatra, mielőtt a tárolt példányt adjuk. Időkorlát
   nélkül egy lassú, de élő kapcsolaton (pince, tele előadó) az app
   fél percig sem indult el, holott ott volt a telefonon. A hálózati válasz
   ettől még megjön, és a háttérben frissíti a tárolót: a következő indulás
   már azt kapja. */
const VARAKOZAS = 3000;

self.addEventListener("install", e => {
  /* Fájlonként tesszük el, nem addAll-lal: egy hiányzó betű vagy ikon miatt ne
     bukjon el az egész telepítés. Maga az app viszont kötelező: ha az nem jön
     le (megszakadó kapcsolat egy frissítés közben), a telepítés elbukik, és a
     régi service worker a régi, működő tárolójával marad — különben egy üres
     tároló lépne a helyére, és offline semmi nem indulna. */
  /* „no-cache”, nem „reload”: a böngésző a saját gyorsítótárából
     feltételesen kérdez (304), így amit a lap épp most töltött le, azt nem
     tölti le még egyszer. */
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(SHELL.map(u => {
      const kesz = c.add(new Request(u, {cache: "no-cache"}));
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

/* A hálózati válasz és a tárolt példány versenye: ha a hálózat VARAKOZAS-on
   belül válaszol, az nyer; ha nem, és van tárolt példány, az. Ha tárolt
   példány nincs, kivárjuk a hálózatot. */
function verseny(halo, tarolt) {
  return new Promise(res => {
    let kesz = false;
    const vege = r => { if (!kesz) { kesz = true; res(r); } };
    const ido = setTimeout(() => tarolt().then(h => { if (h) vege(h); }, () => {}), VARAKOZAS);
    halo.then(r => { clearTimeout(ido); vege(r); },
      () => { clearTimeout(ido); tarolt().then(h => vege(h || Response.error()), () => vege(Response.error())); });
  });
}

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
    const tarolt = () => caches.match("./index.html");
    let iras = null;
    const halo = fetch(req).then(r => {
      if (app && r.ok && r.type !== "opaqueredirect") {
        const copy = r.clone();
        iras = caches.open(CACHE).then(c => c.put("./index.html", copy)).catch(() => {});
      }
      return r;
    });
    // a háttérben befutó válasz is eltárolódjon, ha közben a tárolt példány nyert
    e.waitUntil(halo.then(() => iras, () => {}));
    /* Az átirányítást a böngésző kövesse (a navigáció „manual” módú, ezért
       ez itt opaqueredirect): ha a site új címre költözik, a telepített
       app ne ragadjon a régin a tárolt példánnyal. */
    const valasz = halo.then(r => {
      if (!app || r.type === "opaqueredirect" || r.ok || r.status < 400) return r;
      return tarolt().then(h => h || r);
    }, () => app ? tarolt().then(h => h || Response.error())
      /* Egy másik lap (mérőlap, elgépelt cím) offline nem az app: az a saját
         címén, rossz alapcímmel indulna. */
      : caches.match(req).then(h => h || Response.error()));
    e.respondWith(app ? verseny(valasz, tarolt) : valasz);
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
    const tarolt = () => caches.match(kulcs.href);
    let iras = null;
    const halo = fetch(req).then(r => {
      if (r.ok) {
        /* Csak ép JSON kerülhet a jó példány helyére: egy 200-as hibaoldal
           (portál, csonka válasz) különben felülírta, és offline az sem
           maradt. */
        const copy = r.clone();
        iras = copy.clone().json().then(() => caches.open(CACHE)).then(c => c.put(kulcs.href, copy)).catch(() => {});
      }
      return r;
    });
    e.waitUntil(halo.then(() => iras, () => {}));
    // hibaválasznál (404, 5xx) a tárolt példány, ha van — ugyanúgy, mint offline
    const valasz = halo.then(r => r.ok ? r : tarolt().then(h => h || r),
                             () => tarolt().then(h => h || Response.error()));
    e.respondWith(verseny(valasz, tarolt));
    return;
  }

  /* Betűk, ikonok, manifest: gyorsítótár-először. A nevük NEM a tartalmukhoz
     kötött: egy betűcseréhez a CACHE nevét is emelni kell. A manifest és az
     ikonok viszont a háttérben frissülnek (stale-while-revalidate): egy
     telepített app különben sosem kapná meg az újat, és ritkán kéri őket. */
  const frissit = /\.(webmanifest|png)$/.test(new URL(req.url).pathname);
  e.respondWith(
    caches.match(req).then(hit => {
      const halo = fetch(req).then(r => {
        if (!r.ok) return r;
        const copy = r.clone();
        return caches.open(CACHE).then(c => c.put(req, copy)).then(() => r, () => r);
      });
      if (!hit) return halo;
      if (frissit) e.waitUntil(halo.catch(() => {}));
      return hit;
    })
  );
});
