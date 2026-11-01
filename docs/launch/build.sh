#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
# Requires npm ci, Playwright Chromium, ffmpeg, and a CJK system font.
# Run only in an environment where browser rendering is enabled.
node scripts/demo-evidence.mjs
node scripts/render-launch.mjs
