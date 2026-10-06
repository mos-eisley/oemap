/* Mosdók, lépcsők, lift piktogrammal. Az építészek kérése: ezeket keresik a
   legtöbben, legyen könnyebb odatalálni. A tervlapi kódjuk (E38, FL2) a
   hallgatónak semmit nem mond, ezért a helyén jelvény áll: alaprajzon a szint
   rajzában, Épület nézetben az álló feliratok közt — ott a terem méretétől
   függetlenül, mert egy kis mosdó ugyanúgy kell, mint egy nagy.
   Hogy melyik teremnek mi jár, azt itt a helyiség neve dönti el, nem a kód
   saját szabálya, hogy egy elírás ne igazolja önmagát. */
const { run, open } = require("./lib");

const varas = r => {
  const n = (r.name || "").toUpperCase();
  if (/LÉPCSŐ/.test(n)) return null;          // a lépcsőnél a lift a magtól függ, lent külön
  if (r.cat !== "VIZES HELYISÉGEK") return undefined;
  if (/AK\.?\s*MENT/.test(n)) return ["acc"];
  if (/N[ŐÖ]I/.test(n)) return ["wcw"];
  if (/FFI/.test(n)) return ["wcm"];
  return /WC|MOSDÓ/.test(n) ? ["wc"] : undefined;
};

run("mosdók, lépcsők, lift piktogrammal", async ({ t, ctx, base }) => {
  const p = await open(ctx, base, { settle: 1600 });

  // alaprajz, minden szint: a jelvény ott van, a jó jellel, a terme feliratpontján
  const lap = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const out = [];
    for (const L of D.levels) {
      setLevel(L.level); await w(700);
      const F = FLOOR[L.level];
      // a terem feliratpontja a képen: egy apró kör a síkon, a böngésző méri
      const pont = r => { const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", r.cx); c.setAttribute("cy", r.cy); c.setAttribute("r", .1);
        F.svg.appendChild(c); const b = c.getBoundingClientRect(); c.remove(); return [b.x + b.width / 2, b.y + b.height / 2]; };
      for (const r of F.rs.filter(r => r.code)) {
        const j = F.labels.querySelector(`[data-ico="${r.code}"]`), jb = j && j.getBoundingClientRect(), q = pont(r);
        out.push({ code:r.code, name:r.name, cat:r.cat, lv:L.level,
          jel:j ? [...j.querySelectorAll("use")].map(u => u.getAttribute("href").slice(3)) : null,
          eltol:j ? Math.hypot(jb.x + jb.width / 2 - q[0], jb.y + jb.height / 2 - q[1]) : 0,
          lathato:j ? +getComputedStyle(F.labels).opacity : 0,
          // a teremszáma (ha volna) a feliratponton állna
          szoveg:[...F.labels.querySelectorAll(".lbl")].some(x => { const b = x.getBoundingClientRect();
            return b.width && Math.hypot(b.x + b.width / 2 - q[0], b.y + b.height / 2 - q[1]) < 3; }) });
      }
    }
    setLevel(0); await w(700);
    return { termek:out, liftes:LIFTS.flatMap(l => l.pts.map(x => x[3])) };
  });

  const vizes = lap.termek.filter(x => varas(x) !== undefined && varas(x) !== null);
  const rossz = vizes.filter(x => JSON.stringify(x.jel) !== JSON.stringify(varas(x)));
  t("minden mosdón ott a jele: női, férfi, akadálymentes, általános",
    vizes.length >= 20 && !rossz.length && ["wcw", "wcm", "acc"].every(k => vizes.some(x => x.jel && x.jel[0] === k)),
    `${vizes.length} mosdó, rossz: ${rossz.slice(0, 4).map(x => `${x.code} ${x.name} ${x.jel}`).join(" | ")}`);
  const lepcso = lap.termek.filter(x => /LÉPCSŐ/i.test(x.name || ""));
  const rosszL = lepcso.filter(x => JSON.stringify(x.jel) !==
    JSON.stringify(lap.liftes.includes(x.code) ? ["stair", "lift"] : ["stair"]));
  t("minden lépcsőházon lépcsőjel, a liftes magon mellette liftjel is",
    lepcso.length >= 15 && !rosszL.length && lepcso.some(x => x.jel && x.jel.includes("lift")),
    `${lepcso.length} lépcsőház, rossz: ${rosszL.map(x => `${x.code} ${x.jel}`).join(" | ")}`);
  const jelesek = lap.termek.filter(x => x.jel);
  t("a jelvény látszik, a terme feliratpontján, és a teremszám helyett áll, nem mellette",
    jelesek.every(x => x.lathato === 1 && !x.szoveg && x.eltol < 1),
    jelesek.filter(x => x.lathato !== 1 || x.szoveg || x.eltol >= 1).map(x => `${x.code} ${x.eltol.toFixed(1)}`).join(", "));
  t("más teremre nem kerül jel", lap.termek.filter(x => x.jel && varas(x) === undefined).length === 0,
    lap.termek.filter(x => x.jel && varas(x) === undefined).map(x => x.code).join(", "));

  /* Épület nézet: az álló feliratok közt, magonként egy jelvényben (lépcső,
     mellette a mosdók) — egyenként a képernyőn egymásra estek, és a felük
     sem látszott. Alapnagyításon, telefonon is mind kint van, a mag
     közepén, és nem lóg rá egy teremszámra sem. */
  const epulet = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    setMode(3); await w(1800);
    const kozep = r => {
      const svg = document.querySelector(".floor.on svg");
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", r.cx); c.setAttribute("cy", r.cy); c.setAttribute("r", .2);
      svg.appendChild(c); const b = c.getBoundingClientRect(); c.remove();
      return [b.x + b.width / 2, b.y + b.height / 2];
    };
    const ikon = LABS.filter(L => L.e.classList.contains("tico")), lat = L => !L.e.classList.contains("off");
    const b = LABS.filter(lat).map(L => L.e.getBoundingClientRect());
    let atfed = 0;
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++)
      if (b[i].left < b[j].right - .5 && b[j].left < b[i].right - .5 && b[i].top < b[j].bottom - .5 && b[j].top < b[i].bottom - .5) atfed++;
    const tagok = ikon.flatMap(L => L.r.mag.map(r => r.code)), kell = FLOOR[S.level].rs.filter(r => r.code && iconsOf(r)).map(r => r.code);
    const out = { db:ikon.length, latszik:ikon.filter(lat).flatMap(L => L.r.mag.map(r => r.code)), atfed,
      mind:kell.length > 0 && kell.every(c => tagok.filter(x => x === c).length === 1), rejtett:ikon.filter(L => !lat(L)).length,
      elteres:Math.max(0, ...ikon.filter(lat).map(L => { const a = kozep(L.r), q = L.e.getBoundingClientRect();
        return Math.hypot(a[0] - q.x - q.width / 2, a[1] - q.y - q.height / 2); })),
      jelek:ikon.map(L => [...L.e.querySelectorAll("use")].map(u => u.getAttribute("href").slice(3)).join("+")) };
    setMode(2); await w(1500);
    return out;
  });
  t("Épület nézetben magonként egy jelvényben, minden mosdó és lépcső benne van egyszer",
    epulet.db >= 4 && epulet.mind && epulet.jelek.includes("stair+lift") && epulet.jelek.includes("wcw+wcm+acc"),
    JSON.stringify(epulet));
  t("alapnagyításon mind kint van, a legkisebb mosdóé is", epulet.rejtett === 0 && epulet.latszik.includes("OA00F06"),
    JSON.stringify(epulet));
  t("a termük fölött, és nem lógnak a teremszámokra", epulet.elteres < 1 && epulet.atfed === 0,
    `eltérés ${epulet.elteres.toFixed(2)} px, ${epulet.atfed} átfedés`);
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
});
