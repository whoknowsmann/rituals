#!/usr/bin/env bash
# adb wrapper for WSL.
#
# The Android SDK lives on the Windows side, so WSL drives adb.exe directly.
# This avoids installing a second adb inside WSL, which would fight the Windows
# daemon over the same USB device and produce confusing "device offline" errors.
#
# Usage: ./scripts/adb.sh devices
#        ./scripts/adb.sh logcat -s ReactNativeJS:V
set -euo pipefail

ADB="${ANDROID_ADB:-/mnt/c/Users/hound/AppData/Local/Android/Sdk/platform-tools/adb.exe}"

if [[ ! -x "$ADB" ]]; then
  echo "adb.exe not found at $ADB" >&2
  echo "Set ANDROID_ADB to override." >&2
  exit 1
fi

exec "$ADB" "$@"
