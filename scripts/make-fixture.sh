#!/usr/bin/env bash
# Синтетические материалы: «говорящая» дорожка (тон в моменты слов) и перебивка.
set -euo pipefail
cd "$(dirname "$0")/../fixtures"
EXPR=$(node -e '
const t=JSON.parse(require("fs").readFileSync("speech.json","utf8"));
console.log(t.words.map(w=>`between(t,${w.startMs/1000},${w.endMs/1000})`).join("+"))')
ffmpeg -y -loglevel error \
  -f lavfi -i "testsrc2=size=1080x1920:rate=30:duration=14" \
  -f lavfi -i "aevalsrc='0.4*sin(2*PI*220*t)*(${EXPR})':s=48000:d=14" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest speaker.mp4
ffmpeg -y -loglevel error \
  -f lavfi -i "mandelbrot=size=1080x1920:rate=30" -t 12 -c:v libx264 -pix_fmt yuv420p -an broll.mp4
ls -la speaker.mp4 broll.mp4
