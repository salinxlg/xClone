#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' '[ERROR] Node.js no está disponible. Instala Node.js 18 o superior desde https://nodejs.org/ y abre una terminal nueva.' >&2
  exit 1
fi
exec node ./bin/install.js
