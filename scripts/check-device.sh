#!/usr/bin/env bash
# Verify the Seeker is connected and ready for development.
#
# Reports device identity, Android version, and whether the Rituals app and a
# wallet are installed. Read-only: changes nothing on the device.
set -uo pipefail
cd "$(dirname "$0")/.."
ADB="./scripts/adb.sh"

echo "=== devices ==="
$ADB devices -l

COUNT="$($ADB devices | tr -d '\r' | tail -n +2 | grep -cE '\sdevice([[:space:]]|$)' || true)"
if [[ "$COUNT" -eq 0 ]]; then
  echo
  echo "No authorised device found. Check:"
  echo "  1. USB debugging is enabled (Settings > System > Developer options)"
  echo "  2. The 'Allow USB debugging' dialog was accepted on the phone"
  echo "  3. The cable carries data, not just power"
  echo "  4. If it says 'unauthorized', unplug, replug, and accept the prompt"
  exit 1
fi

echo
echo "=== device ==="
printf 'model    : %s\n' "$($ADB shell getprop ro.product.model | tr -d '\r')"
printf 'device   : %s\n' "$($ADB shell getprop ro.product.device | tr -d '\r')"
printf 'android  : %s\n' "$($ADB shell getprop ro.build.version.release | tr -d '\r')"
printf 'sdk      : %s\n' "$($ADB shell getprop ro.build.version.sdk | tr -d '\r')"
printf 'abi      : %s\n' "$($ADB shell getprop ro.product.cpu.abi | tr -d '\r')"

echo
echo "=== Rituals installed? ==="
if $ADB shell pm list packages 2>/dev/null | tr -d '\r' | grep -q "com.whoknowsmann.rituals"; then
  echo "yes: com.whoknowsmann.rituals"
  $ADB shell dumpsys package com.whoknowsmann.rituals 2>/dev/null | tr -d '\r' | grep -E "versionName|firstInstallTime" | head -2
else
  echo "not installed"
fi

echo
echo "=== wallets present (needed for MWA) ==="
$ADB shell pm list packages 2>/dev/null | tr -d '\r' \
  | grep -Ei "phantom|solflare|backpack|seedvault|solana" || echo "none detected"
