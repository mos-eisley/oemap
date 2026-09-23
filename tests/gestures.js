/* Gesztusok. Ez a fájl egy konkrét, élesben bejelentett hibát őriz: csippentés
   után befagyott a térkép, és a feliratok elmásztak. Az ok az volt, hogy a
   húzás-állapot két helyen állt elő, és az egyik ág nem vitte át a forgatás
   kiindulóértékeit — így NaN lett a szögből, és minden transzformáció elszállt.
   Ezért nem elég, hogy "nincs kivétel": a számoknak végig végesnek kell
   maradniuk, és a térképnek a csippentés UTÁN is mozdíthatónak. */
const { run, open } = require("./lib");

run("gesztusok (csippentés, forgatás, tolás)", async ({ t, ctx, base }) => {
  const p = await open(ctx, base, { settle: 1600 });

  const r = await p.evaluate(async () => {
    const st = document.getElementById("stage"), world = document.getElementById("world");
    st.setPointerCapture = () => {}; st.releasePointerCapture = () => {};
    const s = (type,x,y,id) => st.dispatchEvent(new PointerEvent(type,
      { pointerId:id, clientX:x, clientY:y, bubbles:true, pointerType:"touch", isPrimary:id===1 }));
    const f = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const finite = () => Number.isFinite(S.rot.x) && Number.isFinite(S.rot.z) &&
                         Number.isFinite(S.view.k) && Number.isFinite(S.view.x) && Number.isFinite(S.view.y);
    const out = {};
    setMode(3); await new Promise(r => setTimeout(r, 1400));

    // A valósághű eset: az egyik ujj előbb emelkedik fel, a másik még mozog.
    async function pinch(liftFirst) {
      s("pointerdown",140,420,1); s("pointerdown",250,420,2);
      for (let i=1;i<=10;i++){ s("pointermove",140-i*4,420,1); s("pointermove",250+i*4,420,2); await f(); }
      const other = liftFirst===1 ? 2 : 1;
      s("pointerup", liftFirst===1?100:290, 420, liftFirst);
      for (let i=1;i<=6;i++){ s("pointermove",(other===1?100:290)+i*6, 420+i*2, other); await f(); }
      s("pointerup",0,0,other);
      await new Promise(r => setTimeout(r,250));
    }
    await pinch(1); out.elsoUjjElobb = finite();
    await pinch(2); out.masodikUjjElobb = finite();
    await pinch(1); await pinch(2); await pinch(1); out.haromCsippentesUtan = finite();

    // mozdítható-e még? forgatás egy ujjal
    const rz0 = S.rot.z;
    s("pointerdown",195,400,1);
    for (let i=1;i<=10;i++){ s("pointermove",195+i*10,400,1); await f(); }
    s("pointerup",295,400,1); await new Promise(r => setTimeout(r,200));
    out.forgatasUtana = Number.isFinite(S.rot.z) && Math.abs(S.rot.z-rz0) > 10;
    out.forgatasIranya = S.rot.z - rz0;      // jobbra húzás -> csökkenő z

    // tolás két ujjal
    const vx0 = S.view.x;
    s("pointerdown",140,400,1); s("pointerdown",250,400,2);
    for (let i=1;i<=10;i++){ s("pointermove",140+i*5,400,1); s("pointermove",250+i*5,400,2); await f(); }
    s("pointerup",190,400,1); s("pointerup",300,400,2); await new Promise(r => setTimeout(r,250));
    out.tolasUtana = Number.isFinite(S.view.x) && Math.abs(S.view.x-vx0) > 10;

    const k0 = S.view.k;
    document.getElementById("zin").click(); await new Promise(r => setTimeout(r,200));
    out.nagyitas = S.view.k > k0;
    document.getElementById("zfit").click(); await new Promise(r => setTimeout(r,400));
    out.fitVisszaall = { x:S.rot.x, z:S.rot.z, kVeges:Number.isFinite(S.view.k) };

    /* Kétujjas csavarás. Két ujj egy kör két átellenes pontján, a kört
       forgatjuk — ez a mozdulat se nem nagyít (a távolságuk állandó), se nem
       tol (a középpont áll), tehát amit mér, az tisztán a forgatás. */
    const at = (cx,cy,R,deg) => [cx+R*Math.cos(deg*Math.PI/180), cy+R*Math.sin(deg*Math.PI/180)];
    async function twist(cx,cy,R,from,to,steps){
      let [ax,ay]=at(cx,cy,R,from), [bx,by]=at(cx,cy,R,from+180);
      s("pointerdown",ax,ay,1); s("pointerdown",bx,by,2);
      for(let i=1;i<=steps;i++){
        const g=from+(to-from)*i/steps;
        [ax,ay]=at(cx,cy,R,g); [bx,by]=at(cx,cy,R,g+180);
        s("pointermove",ax,ay,1); s("pointermove",bx,by,2); await f();
      }
      s("pointerup",ax,ay,1); s("pointerup",bx,by,2);
      await new Promise(r => setTimeout(r,200));
    }

    // Épület nézetben (itt vagyunk) forgasson
    const z3 = S.rot.z;
    await twist(195,420,110,0,40,12);
    out.csavar3D = +(S.rot.z - z3).toFixed(1);

    // …és Alaprajzon is, ez volt a hiányzó fele
    setMode(2); await new Promise(r => setTimeout(r,1300));
    const z2 = S.rot.z, k2 = S.view.k, b2 = bearing();
    await twist(195,420,110,0,45,12);
    out.csavar2D = { dz:+(S.rot.z-z2).toFixed(1), dk:+(S.view.k-k2).toFixed(4),
                     dbearing:+(bearing()-b2).toFixed(1),
                     forog:/rotate\(/.test(world.style.transform),
                     nemHarmad:!/rotateX|rotateZ/.test(world.style.transform) };

    // holtjáték: egy apró elcsavarodás ne fordítsa el a térképet
    const z1 = S.rot.z;
    await twist(195,420,110,0,4,8);
    out.holtjatek = +(S.rot.z - z1).toFixed(2);

    // két ujjal nagyítani Alaprajzon is lehet, a csavarás nem vette el
    const k3 = S.view.k;
    s("pointerdown",150,420,1); s("pointerdown",240,420,2);
    for (let i=1;i<=10;i++){ s("pointermove",150-i*5,420,1); s("pointermove",240+i*5,420,2); await f(); }
    s("pointerup",100,420,1); s("pointerup",290,420,2); await new Promise(r => setTimeout(r,250));
    out.csippent2D = S.view.k > k3;

    /* A forgatás nem veheti el a lapos gyorsútvonalat: a .flat2d kapcsolja ki
       a perspektívát és a preserve-3d-t, ezen múlik a telefonos 76 fps. Egy
       2D-s rotate() nem kér 3D kontextust, tehát a csavarás után is állnia
       kell — a fenti `nemHarmad` ezt a transzform oldaláról nézi, ez itt a
       tényleges renderelési útvonal felől. */
    await new Promise(r => setTimeout(r,1200));          // a .flat2d 1050ms-mal később kerül fel
    out.lapos2D = { flat:document.getElementById("app").classList.contains("flat2d"),
                    persp:getComputedStyle(document.getElementById("stage")).perspective,
                    elforgatva:Math.abs(bearing()) > 20 };

    // a ⤢ az elforgatott tervlapot is visszaállítja, és rá is illeszti
    document.getElementById("zfit").click(); await new Promise(r => setTimeout(r,400));
    out.fit2D = { bearing:+bearing().toFixed(1), kVeges:Number.isFinite(S.view.k),
                  xVeges:Number.isFinite(S.view.x) };

    /* Döntés két ujjal. Két ujj egymás mellett, párhuzamosan húzva — se a
       távolságuk, se a szögük nem változik, tehát se nagyítás, se csavarás
       nem keveredik bele. Ez a mozdulat az egyetlen, amelyik nézetet vált:
       az Alaprajzon nincs dőlés, oda csak Épület nézetben lehet menni. */
    async function drag2(x1,y1,x2,y2,dx,dy,steps){
      s("pointerdown",x1,y1,1); s("pointerdown",x2,y2,2);
      for(let i=1;i<=steps;i++){
        const gx=dx*i/steps, gy=dy*i/steps;
        s("pointermove",x1+gx,y1+gy,1); s("pointermove",x2+gx,y2+gy,2); await f();
      }
      s("pointerup",x1+dx,y1+dy,1); s("pointerup",x2+dx,y2+dy,2);
      await new Promise(r => setTimeout(r,250));
    }

    // Alaprajzról felfelé húzva emel át, és közben nem nagyít — hogy a fogás
    // alatti pont a helyén marad, azt lent a folytonossági blokk méri
    const v0 = { k:S.view.k };
    await drag2(600,600,760,600, 0,-140, 16);
    out.felemel = { mode:S.mode, rx:+S.rot.x.toFixed(1),
                    nezetMaradt:Math.abs(S.view.k-v0.k)<1e-6 };
    // tovább felfelé: meredekebb lesz
    const rxA = S.rot.x;
    await drag2(600,600,760,600, 0,-120, 14);
    out.meredekebb = { rx:+S.rot.x.toFixed(1), nott:S.rot.x > rxA };
    // lefelé a földig: visszatesz Alaprajzra, és a dőlés az alapállásra áll,
    // hogy a következő Épület gomb ne egy félbehagyott szögre érkezzen
    await drag2(600,400,760,400, 0,300, 20);
    out.visszaesik = { mode:S.mode, rx:+S.rot.x.toFixed(1), alap:ROT0.x };

    /* A következő három eset azt méri, hogy a döntés NEM lop el más
       mozdulatot. Mindháromban mozdul az ujj függőlegesen is — különben a
       „mindkét ujj azonos irányba, függőlegesen" feltétel egyedül elintézné
       őket, és a küszöbök meglazulása észrevétlen maradna. */
    setMode(3); await new Promise(r => setTimeout(r,1400));

    // ferde tolás: túlnyomóan vízszintes, de van függőleges összetevője is
    const rxB = S.rot.x, vxB = S.view.x;
    await drag2(600,500,760,500, 160,60, 14);
    out.ferdeTolas = { dolt:Math.abs(S.rot.x-rxB)>0.5, tolt:Math.abs(S.view.x-vxB)>50 };

    // csippentés, közben lefelé csúszva: a távolságváltozás dönt, nem a döntés
    const rxC = S.rot.x, kC = S.view.k;
    s("pointerdown",600,500,1); s("pointerdown",760,500,2);
    for (let i=1;i<=12;i++){ s("pointermove",600-i*6,500+i*5,1); s("pointermove",760+i*6,500+i*5,2); await f(); }
    s("pointerup",528,560,1); s("pointerup",832,560,2); await new Promise(r => setTimeout(r,250));
    out.csippentNemDont = { dolt:Math.abs(S.rot.x-rxC)>0.5, nagyit:S.view.k>kC };

    // apró függőleges mozdulat: a küszöb alatt marad, nem dönt
    const rxD = S.rot.x;
    await drag2(600,500,760,500, 0,-10, 6);
    out.aproNemDont = Math.abs(S.rot.x-rxD) < 0.01;

    out.transzformOk = !/NaN/.test(world.style.transform) &&
                       !/NaN/.test(document.querySelector(".ftag").style.transform);
    return out;
  });

  t("az első ujj felemelése után is véges minden", r.elsoUjjElobb);
  t("a második ujj felemelése után is", r.masodikUjjElobb);
  t("három csippentés után is", r.haromCsippentesUtan);
  t("csippentés után még forgatható", r.forgatasUtana);
  t("jobbra húzva a modell jobbra fordul", r.forgatasIranya < 0, "Δz=" + r.forgatasIranya.toFixed(1));
  t("csippentés után még tolható", r.tolasUtana);
  t("a nagyítás gomb nagyít", r.nagyitas);
  t.eq("a ⤢ visszaállítja az alapállást", { x:r.fitVisszaall.x, z:r.fitVisszaall.z }, { x:58, z:0 });

  t("két ujjal csavarva Épület nézetben forog", Math.abs(r.csavar3D) > 20, "Δz=" + r.csavar3D);
  t("Alaprajzon is forog — ez hiányzott", Math.abs(r.csavar2D.dz) > 20, "Δz=" + r.csavar2D.dz);
  t("a tervlap iránya ugyanannyit fordul", Math.abs(r.csavar2D.dbearing - r.csavar2D.dz) < 0.1,
    `Δz=${r.csavar2D.dz}, Δirány=${r.csavar2D.dbearing}`);
  t("a transzformba sima 2D-s rotate() kerül", r.csavar2D.forog && r.csavar2D.nemHarmad,
    "a .flat2d lapos útvonala csak így marad meg");
  t("a tiszta csavarás nem nagyít", Math.abs(r.csavar2D.dk) < 0.01, "Δk=" + r.csavar2D.dk);
  t("apró elcsavarodástól nem fordul el", r.holtjatek === 0, "Δz=" + r.holtjatek);
  t("két ujjal Alaprajzon is lehet nagyítani", r.csippent2D);
  t("az elforgatott tervlap megtartja a lapos gyorsútvonalat",
    r.lapos2D.flat && r.lapos2D.persp === "none" && r.lapos2D.elforgatva,
    JSON.stringify(r.lapos2D));
  t("a ⤢ az elforgatott tervlapot visszaállítja", r.fit2D.bearing === 0, "irány=" + r.fit2D.bearing);
  t("és véges nézetet illeszt rá", r.fit2D.kVeges && r.fit2D.xVeges, JSON.stringify(r.fit2D));

  t("felfelé húzva a tervlap Épület nézetbe emelkedik", r.felemel.mode === 3 && r.felemel.rx > 20,
    `mód=${r.felemel.mode}, dőlés=${r.felemel.rx}°`);
  t("és közben nem nagyít", r.felemel.nezetMaradt);
  t("tovább húzva meredekebb lesz", r.meredekebb.nott, `${r.felemel.rx}° → ${r.meredekebb.rx}°`);
  t("a földig visszahúzva Alaprajzra esik vissza",
    r.visszaesik.mode === 2 && r.visszaesik.rx === r.visszaesik.alap, JSON.stringify(r.visszaesik));
  t("a ferde kétujjas húzás tol, nem dönt",
    !r.ferdeTolas.dolt && r.ferdeTolas.tolt, JSON.stringify(r.ferdeTolas));
  t("a csippentés nagyít, nem dönt",
    !r.csippentNemDont.dolt && r.csippentNemDont.nagyit, JSON.stringify(r.csippentNemDont));
  t("apró függőleges mozdulattól nem dől meg", r.aproNemDont);

  t("semmilyen transzformációban nincs NaN", r.transzformOk);

  /* A kétujjas felemelés folytonossága. Élesben jelentett hiba: „csúnya az
     átmenet" — a felemelés 15°-on indult, az irány 30°-ot ugrott, a többi szint
     egyszerre bukkant elő, és a kép az épület közepe körül billent, nem az
     ujjak alatt. Itt az alaprajz elforgatva és nagyítva áll, mert az irány- és
     a forgáspont-hiba csak így látszik.
     A fogás alatti pontot nem a kód képletével számoljuk vissza: egy apró kört
     teszünk a síkra, és a böngésző saját getBoundingClientRect()-jével mérjük,
     hol látszik. */
  const L = await p.evaluate(async () => {
    const st = document.getElementById("stage"), app = document.getElementById("app");
    const s = (type,x,y,id) => st.dispatchEvent(new PointerEvent(type,
      { pointerId:id, clientX:x, clientY:y, bubbles:true, pointerType:"touch", isPrimary:id===1 }));
    const f = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const w = ms => new Promise(r => setTimeout(r, ms));
    const deep = () => app.classList.contains("deep");
    const tobbi = () => Math.max(...[...document.querySelectorAll(".floor:not(.on)")].map(f => +(f.style.opacity||0)));
    const hol = c => { const b = c.getBoundingClientRect(); return [b.x+b.width/2, b.y+b.height/2]; };
    // egy kör a síkon, oda téve, ami a képernyőn (tx,ty)-on látszik — Newton-lépésekkel
    // a böngésző vetületén (0°-on a leképezés affin, egy lépés is elég volna)
    function proba(tx, ty) {
      const svg = document.querySelector(".floor.on svg");
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("r", .25); svg.appendChild(c);
      let u = svg.viewBox.baseVal.width/2, v = svg.viewBox.baseVal.height/2;
      const at = (a,b) => { c.setAttribute("cx",a); c.setAttribute("cy",b); return hol(c); };
      for (let i = 0; i < 6; i++) {
        const p0 = at(u,v), pu = at(u+.5,v), pv = at(u,v+.5);
        const a = (pu[0]-p0[0])/.5, b = (pv[0]-p0[0])/.5, c2 = (pu[1]-p0[1])/.5, d = (pv[1]-p0[1])/.5;
        const ex = tx-p0[0], ey = ty-p0[1], det = a*d-b*c2;
        u += (d*ex-b*ey)/det; v += (-c2*ex+a*ey)/det;
      }
      at(u,v); return c;
    }
    const X1 = 140, X2 = 250, Y0 = 330;
    /* Elforgatott, nagyított és az épület közepétől eltolt tervlap: a
       forgáspont-hiba az épület közepétől mért távolsággal nő, közel hozzá
       egy pixel alatt maradna. */
    async function alaprajz() {
      setMode(2); await w(1300);
      document.getElementById("zfit").click(); await w(400);
      for (let i = 0; i < 2; i++) { document.getElementById("zin").click(); await w(300); }
      S.rot.z = 25; updateView(); await w(1300);
      s("pointerdown",195,300,1);
      for (let i = 1; i <= 10; i++) { s("pointermove",195,300+i*25,1); await f(); }
      s("pointerup",195,550,1); await w(300);
    }
    // két ujj párhuzamosan felfelé, 4 px-enként; a lezárásig (a döntés
    // felismeréséig) lépked, visszaadja, hol tart
    async function lezarasig() {
      s("pointerdown",X1,Y0,1); s("pointerdown",X2,Y0,2);
      let y = Y0, i = 0;
      while (S.mode !== 3 && i < 20) { i++; y -= 4; s("pointermove",X1,y,1); s("pointermove",X2,y,2); await f(); }
      return y;
    }
    async function tovabb(y, px) {
      for (let i = 0; i < px/4; i++) { y -= 4; s("pointermove",X1,y,1); s("pointermove",X2,y,2); await f(); }
      return y;
    }
    const elenged = async y => { s("pointerup",X1,y,1); s("pointerup",X2,y,2); await w(1500); };
    const out = {};

    await alaprajz();
    /* Három pont a síkon: A és B egy vízszintes szakasz két vége — ha a
       felemelés első képkockája fordít vagy nagyít, ez a szakasz elfordul vagy
       megnyúlik. C az, ahová az ujjak közepe leér: a döntés felismeréséig a
       térkép az ujjakkal megy, utána C-nek a helyén kell maradnia. */
    const A = proba(100, 300), B = proba(290, 300), c = proba((X1+X2)/2, Y0);
    const szakasz = () => { const a = hol(A), b = hol(B);
      return { hossz:Math.hypot(b[0]-a[0], b[1]-a[1]), szog:Math.atan2(b[1]-a[1], b[0]-a[0])*180/Math.PI }; };
    const elotte = szakasz();
    let y = await lezarasig();
    const most = szakasz(), p0 = hol(c);
    out.zar = { mode:S.mode, rx:S.rot.x, deep:deep(), tobbi:tobbi(),
                fordul:+(most.szog-elotte.szog).toFixed(3), nyulik:+(most.hossz/elotte.hossz-1).toFixed(4),
                ujjakAlatt:+Math.hypot(p0[0]-(X1+X2)/2, p0[1]-y).toFixed(2) };
    A.remove(); B.remove();
    const lepesek = [];
    for (let j = 0; j < 50; j++) {
      y = await tovabb(y, 4);
      const p = hol(c);
      lepesek.push({ rx:S.rot.x, deep:deep(), tobbi:tobbi(), d:Math.hypot(p[0]-p0[0], p[1]-p0[1]) });
    }
    out.lepesek = lepesek;
    await elenged(y);
    out.fent = { mode:S.mode, rx:+S.rot.x.toFixed(1), d:+Math.hypot(hol(c)[0]-p0[0], hol(c)[1]-p0[1]).toFixed(2) };
    c.remove();

    /* Elengedve oda úszik, aminek a kép épp mutatja magát: a 3D-s
       megjelenés előtt vissza Alaprajzra — pontosan oda, ahonnan felemelted —,
       utána föl az Épület nézet legkisebb nyugvó dőlésére. */
    await alaprajz();
    y = await lezarasig();
    const nezet = { x:S.view.x, y:S.view.y };
    y = await tovabb(y, 24);                                   // ≈ 6°
    const le = { rx:S.rot.x, deep:deep() };
    await elenged(y);
    out.le = { ...le, mode:S.mode, eltolas:+Math.hypot(S.view.x-nezet.x, S.view.y-nezet.y).toFixed(2),
               flat:app.classList.contains("flat2d") };

    await alaprajz();
    y = await lezarasig();
    const c2 = proba((X1+X2)/2, y), q0 = hol(c2);
    y = await tovabb(y, 44);                                   // ≈ 11°
    const fel = { rx:S.rot.x, deep:deep() };
    await elenged(y);
    out.fel = { ...fel, mode:S.mode, rxUtana:+S.rot.x.toFixed(1), tilt:TILT_MIN,
                d:+Math.hypot(hol(c2)[0]-q0[0], hol(c2)[1]-q0[1]).toFixed(2) };
    c2.remove();
    out.nemNaN = !/NaN/.test(document.getElementById("world").style.transform);
    return out;
  });

  t("a kétujjas felemelés 0°-ról indul", L.zar.mode === 3 && L.zar.rx === 0, JSON.stringify({ mode:L.zar.mode, rx:L.zar.rx }));
  t("az első képkocka nem fordul el", Math.abs(L.zar.fordul) < .05, `${L.zar.fordul}°`);
  t("és nem is nagyít", Math.abs(L.zar.nyulik) < .001, `${(L.zar.nyulik*100).toFixed(2)}%`);
  t("a térkép a döntésig az ujjakkal megy, nem rántódik vissza", L.zar.ujjakAlatt < .5,
    `az ujjak alatti pont ${L.zar.ujjakAlatt} px-re van tőlük`);
  t("és a többi szint még nem bukkan elő", L.zar.tobbi === 0 && !L.zar.deep, JSON.stringify(L.zar));
  const ugras = Math.max(...L.lepesek.map((l,i) => Math.abs(l.rx - (i ? L.lepesek[i-1].rx : 0))));
  t("a dőlés az ujjal együtt, ugrás nélkül nő", ugras <= 1.001 && L.lepesek.at(-1).rx > 40,
    `legnagyobb lépés ${ugras.toFixed(2)}°, vége ${L.lepesek.at(-1).rx.toFixed(1)}°`);
  const elcsuszik = Math.max(...L.lepesek.map(l => l.d));
  t("a fogás alatti pont a helyén marad", elcsuszik < 1, `legnagyobb elmozdulás ${elcsuszik.toFixed(2)} px`);
  t("elengedve is ott marad", L.fent.mode === 3 && L.fent.d < 1, JSON.stringify(L.fent));
  const korai = L.lepesek.filter(l => l.rx < 7.5), kesei = L.lepesek.filter(l => l.rx >= 7.5);
  t("a 3D-s megjelenés félúton kapcsol, nem a mozdulat elején",
    korai.length > 0 && korai.every(l => !l.deep) && kesei.every(l => l.deep),
    JSON.stringify(L.lepesek.map(l => [+l.rx.toFixed(1), l.deep])));
  t("a többi szint vele együtt úszik be, fokozatosan",
    korai.every(l => l.tobbi === 0) && L.lepesek.at(-1).tobbi > .5 &&
    kesei.filter(l => l.rx <= 15).every((l,i,a) => !i || l.tobbi >= a[i-1].tobbi),
    JSON.stringify(L.lepesek.map(l => [+l.rx.toFixed(1), +l.tobbi.toFixed(2)])));
  t("kis dőlésnél elengedve visszaúszik Alaprajzra", L.le.rx < 7.5 && !L.le.deep && L.le.mode === 2 && L.le.flat,
    JSON.stringify(L.le));
  t("pontosan oda, ahonnan felemelted", L.le.eltolas < .5, `eltérés ${L.le.eltolas} px`);
  t("a 3D-s megjelenés után elengedve föláll Épület nézetbe",
    L.fel.rx > 7.5 && L.fel.rx < 15 && L.fel.deep && L.fel.mode === 3 && L.fel.rxUtana === L.fel.tilt,
    JSON.stringify(L.fel));
  t("és a fogás alatti pont ekkor sem mozdul", L.fel.d < 1, `elmozdulás ${L.fel.d} px`);
  t("a felemelés után sincs NaN", L.nemNaN);
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
});
