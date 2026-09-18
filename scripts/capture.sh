#!/usr/bin/env bash
# Device capture helpers for QA and demo material.
#
#   ./scripts/capture.sh shot [name]        one screenshot -> artifacts/
#   ./scripts/capture.sh record [seconds]   screen recording -> artifacts/
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
