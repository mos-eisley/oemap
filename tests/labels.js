/* Teremszámok Épület nézetben. Élesben jelentett hiány: „az épület nézetről
   eltűntek a teremszámok". 3D-ben a síkban fekvő feliratok olvashatatlanok —
   a megdöntött szintet a böngésző a nagyítástól független felbontással
   rajzolja textúrába, a szöveg elmosódott folt lesz —, ezért ott egy lapos,
   a jeleneten kívüli rétegben állnak. Ez a fájl azt őrzi, hogy ott vannak,
   egyenesen állnak, és pontosan a termük fölött: nyugalomban és gesztus
   közben is.
   A terem helyét nem a kód saját leképezésével számoljuk vissza (az a saját
   hibáját nem látná): egy apró kört teszünk a síkra a felirat horgonyára, és
   a böngésző getBoundingClientRect()-jével mérjük, hol látszik. */
const { run, open } = require("./lib");

run("teremszámok Épület nézetben", async ({ t, ctx, base }) => {
  const p = await open(ctx, base, { settle: 1600 });

  const r = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const f = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const reteg = document.getElementById("tlabels");
    const latszik = () => !reteg.classList.contains("off");
    const lathato = () => LABS.filter(L => !L.e.classList.contains("off"));
    const kozep = r => {
      const svg = document.querySelector(".floor.on svg");
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", r.cx); c.setAttribute("cy", r.cy); c.setAttribute("r", .2);
      svg.appendChild(c); const b = c.getBoundingClientRect(); c.remove();
      return [b.x + b.width/2, b.y + b.height/2];
    };
    const felirat = L => { const b = L.e.getBoundingClientRect(); return [b.x + b.width/2, b.y + b.height/2]; };
    // a látható feliratok közül a termétől legmesszebb eső (px); a kerekítés
    // eszközpixelre fél pixelt adhat
    const elteres = () => +Math.max(0, ...lathato().map(L => {
      const a = kozep(L.r), b = felirat(L); return Math.hypot(a[0]-b[0], a[1]-b[1]); })).toFixed(2);
    // álló: a transzform tiszta eltolás, se forgatás, se torzítás
    const allo = () => lathato().every(L => /^matrix\(1, 0, 0, 1,/.test(getComputedStyle(L.e).transform));
    // egymásra sem lógnak: mindegyik a saját terme vetületén belül marad
    const atfed = () => { const b = lathato().map(L => L.e.getBoundingClientRect()); let n = 0;
      for (let i = 0; i < b.length; i++) for (let j = i+1; j < b.length; j++)
        if (b[i].left < b[j].right-.5 && b[j].left < b[i].right-.5 && b[i].top < b[j].bottom-.5 && b[j].top < b[i].bottom-.5) n++;
      return n; };
    const out = {};

    out.alaprajz = { reteg:latszik(), sik:+getComputedStyle(FLOOR[S.level].labels).opacity };

    setMode(3);
    out.valtasKozben = latszik();
    await w(1700);
    out.epulet = { reteg:latszik(), db:lathato().length, sik:+getComputedStyle(FLOOR[S.level].labels).opacity,
                   elteres:elteres(), allo:allo(), atfed:atfed(),
                   szoveg:lathato().map(L => L.e.textContent).slice(0, 6) };

    // kicsinyítve ritkulnak: kisebb teremképbe kevesebb szám fér (asztalon
    // a nagyobb kép miatt illesztve szinte mind kifér, ezért négyszer)
    for (let i = 0; i < 4; i++) { document.getElementById("zout").click(); await w(1400); }
    out.kicsinyitve = { db:lathato().length, atfed:atfed() };
    document.getElementById("zfit").click(); await w(1500);

    // nagyítás; a gomb a következő képkockában ír, akkor tűnnek el
    document.getElementById("zin").click();
    await new Promise(r => requestAnimationFrame(() => r()));
    out.nagyitasKozben = latszik();
    await w(1400); document.getElementById("zin").click(); await w(1500);
    out.nagyitva = { db:lathato().length, elteres:elteres(), atfed:atfed() };

    // elforgatva és meredekebben is egyenesen állnak, és a termük fölött
    S.rot.z = 140; S.rot.x = 72; orientTags(); updateView(); await w(1500);
    out.forgatva = { db:lathato().length, elteres:elteres(), allo:allo() };
    S.rot.z = 0; S.rot.x = 58; orientTags(); document.getElementById("zfit").click(); await w(1500);

    // egy frissítés, ami a kamerát nem mozdítja (kiválasztás, útvonal), nem
    // villantja el őket
    updateView(); out.frissitesUtan = latszik(); await w(300);

    // szintváltás: az új szint termeinek számai jönnek, a mozgás után
    S.level = 3; renderRail(); updateView();
    out.szintvaltasKozben = latszik(); await w(1500);
    out.masikSzint = { reteg:latszik(), mind:LABS.every(L => L.r.level === 3), elteres:elteres() };

    // a halványított (dolgozói) termek száma csak a „minden" szűrővel
    const dolgozoi = () => LABS.filter(L => STAFF.has(L.r.cat)).length;
    out.szuro = { hallgatoi:dolgozoi() };
    setStaff(true); await w(1500); out.szuro.minden = dolgozoi(); out.szuro.reteg = latszik();
    setStaff(false); await w(300);
    S.level = 0; renderRail(); updateView(); await w(1500);

    /* Gesztus közben képkockánként követik a képet: egy ujjal körbejárva és
       két ujjal döntve is, minden lépés után a termük fölött kell lenniük. */
    const st = document.getElementById("stage");
    st.setPointerCapture = () => {}; st.releasePointerCapture = () => {};
    const s = (type,x,y,id) => st.dispatchEvent(new PointerEvent(type,
      { pointerId:id, clientX:x, clientY:y, bubbles:true, pointerType:"touch", isPrimary:id===1 }));
    const kovet = [];
    s("pointerdown",195,330,1);
    for (let i = 1; i <= 16; i++) { s("pointermove",195+i*8,330+i*3,1); await f(); kovet.push(elteres()); }
    s("pointerup",323,378,1); await w(300);
    s("pointerdown",140,330,1); s("pointerdown",250,330,2);
    for (let i = 1; i <= 16; i++) { s("pointermove",140,330-i*5,1); s("pointermove",250,330-i*5,2); await f(); kovet.push(elteres()); }
    s("pointerup",140,250,1); s("pointerup",250,250,2); await w(300);
    out.gesztus = { max:Math.max(...kovet), reteg:latszik(), db:lathato().length };

    // vissza alaprajzra: az álló réteg eltűnik, a síkbeli feliratok jönnek
    setMode(2); await w(1700);
    out.vissza = { reteg:latszik(), sik:+getComputedStyle(FLOOR[S.level].labels).opacity };
    return out;
  });

  t("alaprajzon a síkbeli feliratok látszanak, az álló réteg nem",
    !r.alaprajz.reteg && r.alaprajz.sik === 1, JSON.stringify(r.alaprajz));
  t("Épület nézetben ott vannak a teremszámok", r.epulet.reteg && r.epulet.db >= 5,
    JSON.stringify(r.epulet));
  t("és a síkbeli, elmosódó feliratok helyett állnak", r.epulet.sik === 0, "síkbeli: " + r.epulet.sik);
  t("pontosan a termük fölött", r.epulet.elteres < 1, `legnagyobb eltérés ${r.epulet.elteres} px`);
  t("egyenesen állnak, nem dőlnek a síkkal", r.epulet.allo);
  t("nem lógnak egymásra", r.epulet.atfed === 0, `${r.epulet.atfed} átfedés`);
  t("a nézetváltás mozgása alatt nem látszanak", !r.valtasKozben);
  t("kicsinyítve ritkulnak", r.kicsinyitve.db < r.epulet.db && r.kicsinyitve.atfed === 0,
    `illesztve ${r.epulet.db}, kicsinyítve ${r.kicsinyitve.db}`);
  t("és nagyítva is a helyükön vannak", r.nagyitva.elteres < 1 && r.nagyitva.atfed === 0, JSON.stringify(r.nagyitva));
  t("az animált nagyítás alatt nem látszanak", !r.nagyitasKozben);
  t("elforgatva és meredekebben is állnak, a helyükön", r.forgatva.db > 0 && r.forgatva.allo && r.forgatva.elteres < 1,
    JSON.stringify(r.forgatva));
  t("ami a kamerát nem mozdítja, az nem villantja el őket", r.frissitesUtan);
  t("szintváltáskor a mozgás alatt nem látszanak", !r.szintvaltasKozben);
  t("utána az új szint teremszámai jönnek, a helyükön",
    r.masikSzint.reteg && r.masikSzint.mind && r.masikSzint.elteres < 1, JSON.stringify(r.masikSzint));
  t("a dolgozói termek száma csak a „minden” szűrővel látszik",
    r.szuro.hallgatoi === 0 && r.szuro.minden > 0 && r.szuro.reteg, JSON.stringify(r.szuro));
  t("gesztus közben képkockánként követik a képet", r.gesztus.max < 1 && r.gesztus.reteg && r.gesztus.db > 0,
    JSON.stringify(r.gesztus));
  t("alaprajzon újra a síkbeli feliratok", !r.vissza.reteg && r.vissza.sik === 1, JSON.stringify(r.vissza));

  /* Villogás és meredek szög. Élesben jelentett hiba az első változatról:
     „bizonyos szögben villog, és nagyon lapos szögben eltűnnek a számok".
     Akkor egy szám csak akkor látszott, ha belefért a terem vetületébe: élből
     nézve a terem vékony csík, így 58°-on 16, 85°-on 1 szám maradt, és a
     határon a remegő ujj ki-be kapcsolgatta őket — az alábbi remegésnél
     nagyítva, 80°-nál 24 lépésből 23-szor, egy végig látható számot.
     Villogásnak az számít, ha ugyanaz a szám pár lépésen belül újra vált, a
     kép belsejében. Az egyszeri ki-be nem az (amelyik egy nagyobb terem száma
     mögé bújik, amíg elhalad mellette), és a kép szélén sem: ott a szám a
     térképpel együtt lép ki és be, ahogy maga a terem is. */
  const v = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const f = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const st = document.getElementById("stage");
    st.setPointerCapture = () => {}; st.releasePointerCapture = () => {};
    const s = (type,x,y,id) => st.dispatchEvent(new PointerEvent(type,
      { pointerId:id, clientX:x, clientY:y, bubbles:true, pointerType:"touch", isPrimary:id===1 }));
    const reteg = document.getElementById("tlabels");
    const lathato = () => LABS.filter(L => !reteg.classList.contains("off") && !L.e.classList.contains("off"));
    const atfed = () => { const b = lathato().map(L => L.e.getBoundingClientRect()); let n = 0;
      for (let i = 0; i < b.length; i++) for (let j = i+1; j < b.length; j++)
        if (b[i].left < b[j].right-.5 && b[j].left < b[i].right-.5 && b[i].top < b[j].bottom-.5 && b[j].top < b[i].bottom-.5) n++;
      return n; };
    // lépésenként figyeli a számokat; gyors = ugyanaz a szám 6 lépésen belül
    // újra vált, és az előző meg a mostani lépésben is végig a képen belül
    // állt — ami közben a kép szélén át ki- vagy belépett, az nem villogás
    // (a helyet a böngésző méri, nem a kód saját mezőiből olvassuk)
    const terkep = document.getElementById("mapwrap").getBoundingClientRect();
    function figyel() {
      const bentE = L => { const b = L.e.getBoundingClientRect();
        return b.left > terkep.left && b.right < terkep.right && b.top > terkep.top && b.bottom < terkep.bottom; };
      const volt = LABS.map(L => L.on), mikor = LABS.map(() => -99), vbent = LABS.map(bentE);
      let lepes = 0; const o = { valt:0, gyors:0 };
      o.lep = () => { lepes++; LABS.forEach((L, j) => { const bent = bentE(L);
        if (L.on !== volt[j]) { o.valt++;
          if (bent && vbent[j] && lepes - mikor[j] <= 6) o.gyors++; mikor[j] = lepes; volt[j] = L.on; }
        vbent[j] = bent; }); };
      return o;
    }
    const out = { remeg:{}, atfed:{}, korbe:{} };
    setMode(3); await w(1700);

    document.getElementById("zfit").click(); await w(1500);
    out.alap = lathato().length;
    S.rot.x = 85; updateView(); await w(1500);
    out.elbol = lathato().length;

    for (const zoom of [0, 2]) {
      document.getElementById("zfit").click(); await w(1500);
      for (let z = 0; z < zoom; z++) { document.getElementById("zin").click(); await w(1400); }
      // remegő ujj: két ujjal döntve, ±1,5°-nyit ingázva, több meredek szög körül
      for (const a of [64, 68, 72, 76, 80, 84]) {
        S.rot.x = a; updateView(); await w(1400);
        out.atfed[`${zoom}/${a}`] = atfed();
        s("pointerdown",140,330,1); s("pointerdown",250,330,2);
        let y = 330;
        for (let i = 1; i <= 6; i++) { y -= 4; s("pointermove",140,y,1); s("pointermove",250,y,2); await f(); }
        const o = figyel();
        for (let i = 0; i < 24; i++) { y += (i % 2 ? 6 : -6); s("pointermove",140,y,1); s("pointermove",250,y,2); await f(); o.lep(); }
        s("pointerup",140,y,1); s("pointerup",250,y,2); await w(600);
        out.remeg[`${zoom}/${a}`] = o.gyors;
      }
      // egy teljes, kézzel is követhető tempójú körbejárás
      S.rot.x = 58; updateView(); await w(1400);
      const o = figyel();
      s("pointerdown",195,330,1);
      for (let i = 1; i <= 200; i++) { s("pointermove",195+i*6,330,1); await f(); o.lep(); }
      s("pointerup",1395,330,1); await w(300);
      out.korbe[zoom] = o.gyors;
    }
    return out;
  });
  const osszeg = o => Object.values(o).reduce((a, b) => a + b, 0);
  t("nagyon lapos szögben sem tűnnek el", v.elbol >= 5 && v.elbol >= v.alap/2,
    `58°-on ${v.alap}, 85°-on ${v.elbol} szám`);
  t("élből nézve sem lógnak egymásra", osszeg(v.atfed) === 0, JSON.stringify(v.atfed));
  t("remegő ujj alatt nem villognak", osszeg(v.remeg) === 0, "gyors ki-be: " + JSON.stringify(v.remeg));
  t("körbejáráskor sem villognak", osszeg(v.korbe) === 0, "gyors ki-be: " + JSON.stringify(v.korbe));
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
});
