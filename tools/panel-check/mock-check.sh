#!/bin/sh
#
# One-command proof that the app's panel client works end to end: compile the
# production network code (VictusApi + VictusHttp) together with this tool, mint a
# throwaway certificate for control.victuscloud.com, start the contract fixture,
# and drive sign-in → server list → power → console → resources against it over
# real TLS sockets on the real hostname.
#
#   sh ./tools/panel-check/mock-check.sh
#
# Nothing in the repo is modified and no credential is involved: the fixture's
# account and key are synthetic, and the certificate is written to a temp dir.
#
# For the live panel instead (needs a real key):
#
#   java -cp <classes>:<json.jar> com.victuscloud.ecosystem.PanelCheck \
#       --api-key <identifier><ptlc_…>
#
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WORK=${PANEL_CHECK_WORK:-/tmp/panel-check}
HOSTNAME_FIXTURE="$ROOT/tools/panel-check/test-hosts"

if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ]; then
  JAVA="$JAVA_HOME/bin/java"
  JAVAC="$JAVA_HOME/bin/javac"
  KEYTOOL="$JAVA_HOME/bin/keytool"
elif [ -x /opt/jdk17/bin/java ]; then
  JAVA=/opt/jdk17/bin/java
  JAVAC=/opt/jdk17/bin/javac
  KEYTOOL=/opt/jdk17/bin/keytool
else
  JAVA=java
  JAVAC=javac
  KEYTOOL=keytool
fi

# org.json is already a dependency of the app's unit tests; reuse that jar.
find_json_jar() {
  for dir in "${GRADLE_USER_HOME:-}" "${HOME:-}/.gradle" /root/.gradle "$ROOT/.gradle"; do
    [ -n "$dir" ] && [ -d "$dir" ] || continue
    found=$(find "$dir" -name 'json-20*.jar' 2>/dev/null | head -1)
    if [ -n "$found" ]; then echo "$found"; return 0; fi
  done
  return 1
}
JSON_JAR=${PANEL_CHECK_JSON_JAR:-$(find_json_jar || true)}
if [ -z "$JSON_JAR" ]; then
  echo "error: could not find the org.json jar in the Gradle cache." >&2
  echo "       Run ./gradlew :app:testDebugUnitTest once to download it." >&2
  exit 2
fi

CLASSES="$WORK/classes"
KEYSTORE="$WORK/mockpanel.p12"
TRUSTSTORE="$WORK/trust.jks"
STORE_PASSWORD=changeit

mkdir -p "$CLASSES"

if [ ! -f "$TRUSTSTORE" ]; then
  echo "→ minting a throwaway certificate for control.victuscloud.com"
  "$KEYTOOL" -genkeypair -alias mockpanel -keyalg RSA -keysize 2048 -storetype PKCS12 \
    -keystore "$KEYSTORE" -storepass "$STORE_PASSWORD" -validity 30 \
    -dname "CN=control.victuscloud.com" -ext "SAN=dns:control.victuscloud.com" >/dev/null 2>&1
  "$KEYTOOL" -exportcert -alias mockpanel -keystore "$KEYSTORE" \
    -storepass "$STORE_PASSWORD" -rfc -file "$WORK/mockpanel.crt" >/dev/null 2>&1
  "$KEYTOOL" -importcert -noprompt -alias mockpanel -file "$WORK/mockpanel.crt" \
    -keystore "$TRUSTSTORE" -storepass "$STORE_PASSWORD" >/dev/null 2>&1
fi

echo "→ compiling the shipped network code with the check tool"
"$JAVAC" -encoding UTF-8 -cp "$JSON_JAR" -d "$CLASSES" \
  "$ROOT/app/src/main/java/com/victuscloud/ecosystem/VictusApi.java" \
  "$ROOT/app/src/main/java/com/victuscloud/ecosystem/VictusHttp.java" \
  "$ROOT/app/src/main/java/com/victuscloud/ecosystem/TotpWindow.java" \
  "$ROOT/tools/panel-check/MockPanel.java" \
  "$ROOT/tools/panel-check/PanelCheck.java"

run_check() {
  "$JAVA" \
    -Djdk.net.hosts.file="$HOSTNAME_FIXTURE" \
    -Djavax.net.ssl.trustStore="$TRUSTSTORE" \
    -Djavax.net.ssl.trustStorePassword="$STORE_PASSWORD" \
    -cp "$CLASSES:$JSON_JAR" \
    com.victuscloud.ecosystem.PanelCheck \
    --mock --keystore "$KEYSTORE" --keystore-password "$STORE_PASSWORD" "$@"
}

STATUS=0
echo
echo "=============== API key (bearer) path ==============="
run_check || STATUS=$?

# Exit 3 means the fixture could not bind 127.0.0.1:443 — a restricted runner,
# not a broken client. Skip rather than fail the build.
if [ "$STATUS" -eq 3 ]; then
  echo
  echo "mock-check: SKIPPED — this environment cannot bind 127.0.0.1:443"
  exit 0
fi

echo
echo "=============== session (password) path ==============="
run_check --user fixture@victuscloud.com --password local-fixture-password \
  --power stop --command "whitelist add Notch" || STATUS=1

echo
if [ "$STATUS" -eq 0 ]; then
  echo "mock-check: PASS"
else
  echo "mock-check: FAIL"
fi
exit "$STATUS"
