#!/usr/bin/env bash
# Device capture helpers for QA and demo material.
#
#   ./scripts/capture.sh shot [name]        one screenshot -> artifacts/
#   ./scripts/capture.sh record [seconds]   screen recording -> artifacts/
#   ./scripts/capture.sh take [segments]    the demo take: N back-to-back 180 s segments -> artifacts/video/take-<stamp>-N.mp4
#   ./scripts/capture.sh logs               live Rituals logs (ctrl-c to stop)
#   ./scripts/capture.sh crash              recent crashes and fatal errors
#
# Recording on-device beats filming a phone: no glare, no shake, true colour,
# and the result is already a clean file for the submission video.
set -uo pipefail
cd "$(dirname "$0")/.."
ADB="./scripts/adb.sh"
OUT="artifacts"
mkdir -p "$OUT"
STAMP="$(date -u +%Y%m%d-%H%M%S)"

case "${1:-shot}" in
  shot)
    NAME="${2:-screen}-$STAMP.png"
    $ADB exec-out screencap -p > "$OUT/$NAME"
    echo "$OUT/$NAME"
    ;;

  record)
    SECS="${2:-30}"
    NAME="record-$STAMP.mp4"
    echo "recording ${SECS}s..."
    # Record on-device, then pull, since screenrecord cannot stream to stdout.
    $ADB shell screenrecord --time-limit "$SECS" --bit-rate 8000000 /sdcard/_rec.mp4
    $ADB pull /sdcard/_rec.mp4 "$OUT/$NAME" >/dev/null
    $ADB shell rm -f /sdcard/_rec.mp4
    echo "$OUT/$NAME"
    ;;

  take)
    # screenrecord stops at 180 s, so a ~4 min take is chained segments. Each one starts the
    # moment the previous returns (~1 s seam). In the video-script timeline the first seam
    # (t=180 s) lands inside week 2's countdown, where nothing changes on screen, so the
    # cut never needs a frame from the seam. Output is variable frame rate: render.py
    # forces 30 fps. Pull everything at the end, never mid-take.
    N="${2:-2}"
    mkdir -p "$OUT/video"
    for i in $(seq 1 "$N"); do
      echo "segment $i/$N recording (180 s)..."
      $ADB shell screenrecord --time-limit 180 --bit-rate 12000000 "/sdcard/_take-$i.mp4"
    done
    for i in $(seq 1 "$N"); do
      $ADB pull "/sdcard/_take-$i.mp4" "$OUT/video/take-$STAMP-$i.mp4" >/dev/null && echo "$OUT/video/take-$STAMP-$i.mp4"
    done
    ;;

  logs)
    # ReactNativeJS carries console output; the rest catch native MWA failures.
    $ADB logcat -c
    echo "streaming Rituals logs (ctrl-c to stop)..."
    $ADB logcat ReactNativeJS:V ReactNative:V AndroidRuntime:E SolanaMobileWalletAdapter:V "*:S"
    ;;

  crash)
    echo "=== recent fatal errors ==="
    $ADB logcat -d -b crash 2>/dev/null | tail -60
    echo
    echo "=== recent AndroidRuntime errors ==="
    $ADB logcat -d AndroidRuntime:E "*:S" 2>/dev/null | tail -40
    ;;

  *)
    echo "usage: $0 {shot|record|logs|crash}" >&2
    exit 1
    ;;
esac
