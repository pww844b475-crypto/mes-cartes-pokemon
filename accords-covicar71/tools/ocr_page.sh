#!/bin/bash
# ocr_page.sh PDF N  -> extraits/<nom>/pN.txt (texte natif si présent, sinon OCR fra)
f=$1; i=$2; b=$(basename "$f" .pdf); mkdir -p extraits/$b
[ -s extraits/$b/p$i.txt ] && exit 0
t=$(pdftotext -f $i -l $i "$f" - | wc -c)
if [ "$t" -gt 200 ]; then pdftotext -f $i -l $i -layout "$f" extraits/$b/p$i.txt
else
  pdftoppm -f $i -l $i -r 200 -gray -png "$f" /tmp/o_${b}_$i
  OMP_THREAD_LIMIT=1 tesseract /tmp/o_${b}_$i-*.png extraits/$b/p$i -l fra >/dev/null 2>&1
  rm -f /tmp/o_${b}_$i-*.png
fi
