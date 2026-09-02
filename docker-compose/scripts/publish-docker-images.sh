#!/usr/bin/env bash
# Build and push VeriFayda oidc-ui + esignet-ui-assets artifactory images to Docker Hub.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OIDC_TAG="${OIDC_TAG:-amanijo/oidc-ui:v1.7.1-totp}"
ART_TAG="${ART_TAG:-amanijo/artifactory-server:v1.3.1-esignet-language-dropdown}"
PUSH="${PUSH:-1}"

echo "=== Prepare oidc-ui ==="
bash "$ROOT/docker-compose/scripts/prepare-oidc-ui-publish.sh"

echo "=== Prepare artifacts ==="
bash "$ROOT/docker-compose/scripts/prepare-artifacts-publish.sh"

echo "=== Build $OIDC_TAG ==="
docker build -t "$OIDC_TAG" "$ROOT/oidc-ui"

echo "=== Build $ART_TAG ==="
docker build \
  -f "$ROOT/artifacts/Dockerfile.esignet-ui-assets" \
  -t "$ART_TAG" \
  "$ROOT/artifacts"

if [[ "$PUSH" == "1" ]]; then
  echo "=== Push $OIDC_TAG ==="
  docker push "$OIDC_TAG"
  echo "=== Push $ART_TAG ==="
  docker push "$ART_TAG"
  echo "Published:"
  echo "  $OIDC_TAG"
  echo "  $ART_TAG"
else
  echo "PUSH=0 — images built locally only."
fi
