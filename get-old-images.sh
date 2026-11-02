#!/usr/bin/env bash
# Run this ONCE, before you point tuckyes.com at GitHub Pages.
# It copies the photos the new site uses from the old Mobirise site
# into assets/images/. After the DNS switch, the old copies are gone.
set -euo pipefail
cd "$(dirname "$0")/assets/images"
for f in \
  pxl-20240631.png \
  dsc00290.jpg \
  5098443140804750662-121.jpeg \
  screenshot-2025-03-17.png \
  5098443140804750670-121.jpeg \
  5098443140804750671-121.jpeg \
  large-display-0406202305-hdr-3.png \
  screenshot-2025-6.png
do
  echo "getting $f"
  curl -fsSL -o "$f" "https://tuckyes.com/assets/images/$f"
done
echo "done. now: git add assets/images && git commit -m 'Add photos' && git push"
