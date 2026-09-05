#!/bin/bash
# Replace consent-service-impl classes inside the Spring Boot fat jar.
set -euo pipefail

FAT_JAR="${FAT_JAR:-/home/mosip/esignet-service.jar}"
PATCH_ROOT="${PATCH_ROOT:-/opt/esignet-patches}"
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

cd "$WORKDIR"
unzip -qo -j "$FAT_JAR" 'BOOT-INF/lib/consent-service-impl-*.jar'
CONSENT_JAR=$(ls consent-service-impl-*.jar)
echo "Patching nested $CONSENT_JAR"
java -cp "$PATCH_ROOT" ZipUpdater "$CONSENT_JAR" "$PATCH_ROOT"
mkdir -p BOOT-INF/lib
mv "$CONSENT_JAR" "BOOT-INF/lib/$CONSENT_JAR"
echo "Replacing $CONSENT_JAR in $FAT_JAR"
java -cp "$PATCH_ROOT" ZipUpdater "$FAT_JAR" "$WORKDIR"
echo "Patched consent-service-impl in $FAT_JAR"
