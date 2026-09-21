#!/usr/bin/env node
/* Az összes regressziós teszt egy parancsból. Külön folyamatban futnak:
   mindegyik saját böngészőt és saját szervert indít, így egy elszálló teszt
   nem viszi magával a többit, és a sorrendjük sem számít. */
const { spawnSync } = require("child_process");
const fs = require("fs"), path = require("path");

const only = process.argv.slice(2);
const files = fs.readdirSync(__dirname)
  .filter(f => f.endsWith(".js") && !["run.js", "lib.js"].includes(f))
  .filter(f => !only.length || only.some(o => f.startsWith(o.replace(/\.js$/, ""))))
  .sort();

if (!files.length) { console.error("nincs ilyen teszt:", only.join(" ")); process.exit(2); }

let failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: "inherit" });
  if (r.status !== 0) failed.push(f);
  console.log("");
}

if (failed.length) {
  console.log(`✗ ${failed.length}/${files.length} tesztfájl bukott: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(`✓ mind a ${files.length} tesztfájl rendben`);
