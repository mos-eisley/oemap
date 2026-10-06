/* Hallgatói / Minden szűrő, és a tervtári színezés. A meeting döntése: a
   hallgatónak nem kell látnia az irodákat, üzemeltetést, raktárakat — azok
   "zaj". Halványítjuk, nem töröljük: a szint sziluettje MINDEN helyiség
   poligonjából áll össze, kivéve őket lyukas lenne az alaprajz. Keresésből és
   kiválasztásból sem eshetnek ki.
   Az építészek kérése: a színek az Egyetemi Tervtár funkcióalaprajzainak
   színkulcsát kövessék (alapinformációk, 2026.02.24) — a halványított
   helyiség is a saját színében áll, nem szürkén. Az értékeket a kulcs
   képéből mértük; itt azok állnak, nem a kód saját táblája, hogy egy
   elírás ne igazolja önmagát. */
const { run, open } = require("./lib");

const TERVTAR = [["ELŐADÓ - SZEMINÁRIUM", "#fa9a90"], ["LABOR", "#fcbcb5"], ["IRODÁK", "#fff7da"],
  ["VIZES HELYISÉGEK", "#87b6b8"], ["SPORT - ÖLTÖZŐK", "#cac7df"], ["HÖK", "#f9daa0"], ["KÖZLEKEDŐK", "#cfcfcf"],
  ["ELŐTEREK", "#e7e7e7"], ["KÖZÖSSÉGI TEREK", "#ffb062"], ["RAKTÁROZÁS/TÁROLÁS", "#d1d685"],
  ["DOLGOZÓI TERÜLETEK", "#bdd0d7"], ["ÜZEMELTETÉS", "#99acbf"], ["EGYETEMI SZOLGÁLTATÁS", "#b0c3a8"],
  ["KÖNYVTÁR", "#d3c7be"], ["KÜLSŐS SZOLGÁLTATÁS", "#b5909b"]];
const rgb = h => `rgb(${[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(", ")})`;

run("hallgatói szűrő és tervtári színek", async ({ t, ctx, base }) => {
  const p = await open(ctx, base, { settle: 1600 });

  // világos témában minden helyiség a tervtári színében, a halványított is
  const szin = await p.evaluate(() => {
    S.theme = "light"; applyTheme();
    const termek = [];
    for (const po of document.querySelectorAll(".room")) {
      const r = D.rooms.find(x => x.poly.map(p => p.join(",")).join(" ") === po.getAttribute("points"));
      termek.push([r.cat, getComputedStyle(po).fill, po.classList.contains("staff")]);
    }
    toggleLeg(true);
    const leg = [...document.querySelectorAll("#legPop .grid > div")].map(x => x.textContent.trim());
    toggleLeg(false);
    return { termek, leg };
  });
  const elter = szin.termek.filter(([cat, fill]) => { const e = TERVTAR.find(x => x[0] === cat); return !e || fill !== rgb(e[1]); });
  t("minden helyiség a tervtári színkulcs színében áll", elter.length === 0 && szin.termek.length > 150,
    `${szin.termek.length} helyiség, eltér: ${elter.slice(0, 4).map(x => x.join(" ")).join(" | ")}`);
  t("a halványított dolgozói helyiség is a saját színében, nem szürkén",
    szin.termek.some(([cat, , st]) => st && cat === "IRODÁK") && szin.termek.filter(x => x[2]).every(([cat, fill]) =>
      fill === rgb(TERVTAR.find(x => x[0] === cat)[1])), szin.termek.filter(x => x[2]).slice(0, 3).map(x => x.join(" ")).join(" | "));
  t("a jelmagyarázat a tervtári kulcs sorrendjében sorolja a 15 kategóriát",
    JSON.stringify(szin.leg) === JSON.stringify(TERVTAR.map(x => x[0].toLowerCase())), JSON.stringify(szin.leg));

  const r = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r,ms));
    const cnt = s => document.querySelectorAll(s).length;
    const cs = e => getComputedStyle(e);
    const out = {};
    dive(2); await w(1400);                          // I. emelet: itt a legtöbb iroda
    out.szint = lvName(S.level);
    const staffEl = () => document.querySelector(".floor.on .room.staff");

    out.hallgatoi = { osszes:cnt(".floor.on .room"), halvany:cnt(".floor.on .room.staff"),
                      feliratok:cnt(".floor.on .glabel text"), opacity:+cs(staffEl()).opacity };
    document.getElementById("stOn").click(); await w(700);
    out.minden = { feliratok:cnt(".floor.on .glabel text"), opacity:+cs(staffEl()).opacity };
    document.getElementById("stOff").click(); await w(700);
    out.vissza = { feliratok:cnt(".floor.on .glabel text"), opacity:+cs(staffEl()).opacity };

    const iroda = D.rooms.find(x => x.code && x.cat === "IRODÁK" && x.level === S.level);
    out.iroda = iroda.code;
    out.keresheto = search(iroda.code).length > 0;
    select(iroda.code); await w(300);
    out.kivalaszthato = S.sel === iroda.code && !!document.querySelector(".room.sel");
    return out;
  });

  t("az I. emeleten vannak halványított helyiségek", r.hallgatoi.halvany > 0,
    `${r.hallgatoi.halvany}/${r.hallgatoi.osszes}`);
  t("a halványítás nem tünteti el őket", r.hallgatoi.opacity > 0 && r.hallgatoi.opacity < 1,
    "opacity=" + r.hallgatoi.opacity);
  t("„Minden”-re váltva több felirat jelenik meg", r.minden.feliratok > r.hallgatoi.feliratok,
    `${r.hallgatoi.feliratok} -> ${r.minden.feliratok}`);
  t("és visszaáll a teljes átlátszatlanság", r.minden.opacity === 1, "opacity=" + r.minden.opacity);
  t("visszakapcsolva újra halványak", r.vissza.opacity === r.hallgatoi.opacity &&
    r.vissza.feliratok === r.hallgatoi.feliratok, JSON.stringify(r.vissza));
  t("a halvány iroda kereséssel megtalálható", r.keresheto, r.iroda);
  t("és ki is választható", r.kivalaszthato, r.iroda);
  t("nincs JS hiba", p.jsErrors.length === 0, p.jsErrors.join(" | "));
});
