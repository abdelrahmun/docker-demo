#!/usr/bin/env bash
# ==================================================================
#  Live demo script — run from anywhere:  ./demo/run-demo.sh
#  Press ENTER to run each step.   AUTO=1 ./demo/run-demo.sh runs all.
#  (Step titles are in English on purpose: Arabic does not render well
#   in most terminals. The app itself is fully Arabic.)
# ==================================================================
set -u
cd "$(dirname "$0")/.."

B="\033[1m"; C="\033[36m"; G="\033[32m"; Y="\033[33m"; R="\033[31m"; N="\033[0m"
URL="http://localhost:8080"
AUTO="${AUTO:-0}"

step() {
  local n="$1" title="$2" cmd="$3"
  echo -e "\n${B}${C}[$n/8] ${title}${N}"
  printf "${Y}\$ %s${N}\n" "$cmd"
  if [ "$AUTO" = "1" ]; then sleep 1; else read -r -p "   ↵ ENTER to run " _; fi
  eval "$cmd"
  local rc=$?
  if [ $rc -ne 0 ]; then
    echo -e "${R}Step $n failed (exit $rc)${N}"
    [ "$AUTO" = "1" ] && exit $rc
  fi
}
pause() {
  echo -e "${G}→ $1${N}"
  if [ "$AUTO" = "1" ]; then sleep 2; else read -r -p "   ↵ ENTER to continue " _; fi
}
# waits (silently) until the app answers /health — up to 60s
wait_app() {
  printf "   waiting for the app"
  for _ in $(seq 1 60); do
    if curl -fs -o /dev/null "$URL/health"; then echo -e " ${G}ready${N}"; return 0; fi
    printf "."; sleep 1
  done
  echo -e " ${R}not ready${N}"; [ "$AUTO" = "1" ] && exit 1; return 1
}

# ---------- Preflight ----------
if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running — start Docker Desktop or use Codespaces"
  exit 1
fi

# ---------- Reset: start every run from a clean state ----------
echo -e "${B}Resetting the demo environment...${N}"
docker compose down -v --remove-orphans >/dev/null 2>&1
docker rmi demo-app:2.0.0 >/dev/null 2>&1
echo "Ready."

# ---------- The 8 steps ----------
step 1 "The team template: one short Dockerfile" \
  "grep -vE '^\\s*(#|\$)' Dockerfile"

step 2 "Start the full environment (app + database) with ONE command" \
  "docker compose up -d --build && docker compose ps"
wait_app

step 3 "Create 3 support tickets through the API" \
  "while read -r t; do curl -s -o /dev/null -w 'created: HTTP %{http_code}\n' -X POST $URL/api/tickets -H 'Content-Type: application/json' -d \"\$t\"; done < demo/sample-tickets.jsonl"
pause "Open $URL in the browser"

step 4 "Security: the app runs as a normal user, not root" \
  "docker compose exec app id"

step 5 "Self-healing: crash the app on purpose" \
  "curl -s -X POST $URL/crash; echo; sleep 5; docker compose ps app; curl -s $URL/health; echo"
wait_app
pause "It came back by itself — refresh the page, nothing was lost"

step 6 "Update to version 2.0.0 (new image, same data)" \
  "APP_VERSION=2.0.0 docker compose up -d --build app"
wait_app
pause "Refresh: green badge, search + 'تم الحل', tickets still there"

step 7 "Rollback to version 1.0.0 in seconds" \
  "APP_VERSION=1.0.0 docker compose up -d app"
wait_app
pause "Back to v1, data still there"

step 8 "Central logs (JSON) from the app container" \
  "docker compose logs --tail 5 app"

echo -e "\n${B}${G}Demo finished.${N}  Clean up with:  ${Y}docker compose down -v${N}"
