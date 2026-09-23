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

    // nagyítva sűrűsödnek; a gomb a következő képkockában ír, akkor tűnnek el
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
  t("nagyítva sűrűsödnek", r.nagyitva.db > r.epulet.db, `${r.epulet.db} → ${r.nagyitva.db}`);
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
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
});
