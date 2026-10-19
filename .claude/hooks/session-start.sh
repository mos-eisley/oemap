#!/bin/bash
# Felhős munkamenet indulásakor telepíti a teszt-függőségeket, hogy az
# `npm test` azonnal futtatható legyen.
set -euo pipefail

# Helyi gépen ne szóljon bele a fejlesztő környezetébe.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# A böngésző a képen már ott van (/opt/pw-browsers), a postinstall ne töltse le
# újra — az percekbe telne és feleslegesen fogyasztaná a lemezt.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm install --no-audit --no-fund

# A tools/ Python-eszközei (tervlapok, épületadat-táblák, IFC) enélkül el sem
# indulnak, és a következő munka épp az: a maradék épületek geometriája. Nem
# állítjuk meg a munkamenetet, ha nem megy — az app és a tesztek ettől
# függetlenül futnak.
pip install --quiet --disable-pip-version-check -r tools/requirements.txt \
  || echo "figyelem: a tools/ Python-függőségei nem mentek fel (pip install -r tools/requirements.txt)"

# A tesztek maguk keresik meg a böngészőt, de ha valaki kézzel futtat valamit,
# jól jön az útvonal is.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1' >> "$CLAUDE_ENV_FILE"
fi

echo "kész: npm test futtatható"
