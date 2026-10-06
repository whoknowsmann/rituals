#!/usr/bin/env bash
# Local EAS build -> artifacts/rituals-$TAG.apk, staged for adb. Usage: TAG=d4 scripts/build-apk-local.sh
set -u
cd "$(dirname "$0")/.."   # the worktree this script lives in, so experiment branches build themselves
export JAVA_HOME=$HOME/.local/jdk/jdk-17.0.20.1+1
export PATH=$JAVA_HOME/bin:$PATH
export EAS_LOCAL_BUILD_WORKINGDIR=$HOME/.cache/eas-local-build
mkdir -p artifacts
LOG=artifacts/apk-build-${TAG:-local}.log
echo "commit $(git rev-parse --short HEAD) start $(date)" > "$LOG"
rc=1
for i in 1 2 3; do
  npx eas-cli build --local --profile preview --platform android --non-interactive --output artifacts/rituals-${TAG:-local}.apk >> "$LOG" 2>&1
  rc=$?
  [ $rc -eq 0 ] && break
  grep -q "GraphQL request failed" "$LOG" || break
  echo "retry $i after GraphQL 503" >> "$LOG"
done
echo "EXIT=$rc end $(date)" >> "$LOG"
if [ $rc -eq 0 ]; then
  mkdir -p /mnt/c/Users/hound/AppData/Local/Temp/rituals
  cp artifacts/rituals-${TAG:-local}.apk /mnt/c/Users/hound/AppData/Local/Temp/rituals/ && echo "STAGED" >> "$LOG"
fi
tail -5 "$LOG"
exit $rc
