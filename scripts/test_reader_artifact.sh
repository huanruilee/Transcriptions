#!/usr/bin/env bash
set -euo pipefail
reader_site_root=$(mktemp -d)
reader_server_pid=""
cleanup() {
  if [ -n "$reader_server_pid" ]; then kill "$reader_server_pid" 2>/dev/null || true; fi
  rm -rf "$reader_site_root"
}
trap cleanup EXIT
ln -s "$PWD/_site" "$reader_site_root/Transcriptions"
python3 -m http.server 4173 --bind 127.0.0.1 --directory "$reader_site_root" > "$reader_site_root/server.log" 2>&1 &
reader_server_pid=$!
export READER_BASE_URL=http://127.0.0.1:4173/Transcriptions/
export READER_SMOKE_PHASE=artifact
node --input-type=module -e 'const u=process.env.READER_BASE_URL; for(let i=0;i<30;i++){try{if((await fetch(u)).ok)process.exit(0)}catch{} await new Promise(r=>setTimeout(r,1000))}process.exit(1)'
npm run test:reader-smoke
