#!/usr/bin/env bash
# Start the Firebase emulators. firebase-tools 15 needs Java 21+; fall back to
# Android Studio's bundled JDK when the default java is older.
set -euo pipefail
cd "$(dirname "$0")/.."
java_major() { "$1" -version 2>&1 | awk -F[\".] '/version/ {print ($2 == "1" ? $3 : $2)}'; }
if [ "$(java_major java || echo 0)" -lt 21 ]; then
  for candidate in "/Applications/Android Studio.app/Contents/jbr/Contents/Home" "$(/usr/libexec/java_home -v 21+ 2>/dev/null || true)"; do
    if [ -x "$candidate/bin/java" ]; then export JAVA_HOME="$candidate" PATH="$candidate/bin:$PATH"; break; fi
  done
fi
npm --prefix functions run build
exec npx firebase emulators:start --project demo-chronosnap --only auth,firestore,functions,tasks
