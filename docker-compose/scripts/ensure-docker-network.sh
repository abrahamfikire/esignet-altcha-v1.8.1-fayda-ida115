#!/usr/bin/env bash
# Keep Docker bridge subnets on 198.18.x.x so govvpn routes (172.16/12) are not hijacked.
set -euo pipefail
DC="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$DC/.env" ]]; then set -a; # shellcheck disable=SC1091
  source "$DC/.env"; set +a; fi

# RFC1918 + govvpn ranges — never use these for Docker bridges.
subnet_conflicts_with_govvpn() {
  local subnet="$1"
  local base="${subnet%%/*}"
  local a b _ _
  IFS=. read -r a b _ _ <<< "$base"
  [[ "$a" == "10" ]] && return 0
  [[ "$a" == "172" && "$b" -ge 16 && "$b" -le 31 ]] && return 0
  [[ "$a" == "192" && "$b" == "168" ]] && return 0
  return 1
}

ensure_network() {
  local name="$1" subnet="$2"
  if subnet_conflicts_with_govvpn "$subnet"; then
    echo "Refusing to create $name on $subnet (conflicts with govvpn)."
    exit 1
  fi
  if docker network inspect "$name" >/dev/null 2>&1; then
    local current
    current="$(docker network inspect "$name" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}')"
    if [[ "$current" == "$subnet" ]] && ! subnet_conflicts_with_govvpn "$current"; then
      echo "Network $name OK ($subnet)"
      return 0
    fi
    echo "Network $name uses $current — must be $subnet for govvpn safety."
    echo "  Removing $name..."
    if ! docker network rm "$name" >/dev/null 2>&1; then
      echo "  Stop containers on $name first, e.g.: docker rm -f \$(docker ps -aq --filter network=$name)"
      exit 1
    fi
  fi
  docker network create "$name" --driver bridge --subnet "$subnet" >/dev/null
  echo "Created network $name ($subnet)"
}

check_govvpn_route() {
  local ip host
  host="${GOVVPN_CHECK_HOST:-report.fayda.et}"
  ip="$(getent hosts "$host" 2>/dev/null | awk '{print $1}' | head -1)" || return 0
  [[ -z "$ip" ]] && return 0
  # Only relevant for hosts in govvpn-managed 172.16–172.31 space.
  [[ "$ip" =~ ^172\.(1[6-9]|2[0-9]|3[0-1])\. ]] || return 0
  if ! ip link show tun0 >/dev/null 2>&1; then
    return 0
  fi
  local route
  route="$(ip route get "$ip" 2>/dev/null || true)"
  if [[ "$route" == *" dev br-"* ]] || [[ "$route" == *" dev docker"* ]]; then
    echo "ERROR: $host ($ip) still routes via Docker — govvpn sites will fail."
    echo "  $route"
    echo "  Run: $DC/scripts/ensure-docker-network.sh"
    return 1
  fi
  echo "Govvpn route OK: $host ($ip) via tun0"
  return 0
}

# Remove stray Docker bridges on VPN-conflicting subnets (e.g. mosip_network on 172.18.0.0/16).
cleanup_conflicting_networks() {
  local name subnet containers
  while IFS= read -r name; do
    [[ -z "$name" || "$name" == "host" || "$name" == "none" ]] && continue
    subnet="$(docker network inspect "$name" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || true)"
    [[ -z "$subnet" ]] && continue
    subnet_conflicts_with_govvpn "$subnet" || continue
    containers="$(docker network inspect "$name" --format '{{len .Containers}}' 2>/dev/null || echo 0)"
    if [[ "$containers" == "0" ]]; then
      docker network rm "$name" >/dev/null 2>&1 && echo "Removed conflicting network $name ($subnet)"
      continue
    fi
    echo "WARNING: network $name ($subnet) conflicts with govvpn and has $containers container(s)."
    docker ps -a --filter "network=$name" --format '  - {{.Names}}' 2>/dev/null || true
    echo "  Recreate those containers on ${OIDC_UI_NETWORK:-verifayda-local} (${DOCKER_SUBNET:-198.18.50.0/24}), then: docker network rm $name"
  done < <(docker network ls --format '{{.Name}}')
}

ensure_network "${OIDC_UI_NETWORK:-verifayda-local}" "${DOCKER_SUBNET:-198.18.50.0/24}"

cleanup_conflicting_networks

# docker compose project default network (may already exist from prior runs)
COMPOSE_NET="${COMPOSE_PROJECT_NAME:-docker-compose}_default"
if docker network inspect "$COMPOSE_NET" >/dev/null 2>&1; then
  current="$(docker network inspect "$COMPOSE_NET" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}')"
  want="${DOCKER_COMPOSE_SUBNET:-198.18.51.0/24}"
  if [[ "$current" != "$want" ]] || subnet_conflicts_with_govvpn "$current"; then
    echo "Network $COMPOSE_NET uses $current — recreate with: docker compose down && docker network rm $COMPOSE_NET"
  fi
fi

check_govvpn_route || exit 1
