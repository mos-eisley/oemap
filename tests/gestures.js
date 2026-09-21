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
  t("semmilyen transzformációban nincs NaN", r.transzformOk);
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
});
