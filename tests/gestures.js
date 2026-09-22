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
  t.eq("a ⤢ visszaállítja az alapállást", { x:r.fitVisszaall.x, z:r.fitVisszaall.z }, { x:58, z:-30 });

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

  t("semmilyen transzformációban nincs NaN", r.transzformOk);
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
});
