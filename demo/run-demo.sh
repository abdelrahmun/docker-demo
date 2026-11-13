#!/usr/bin/env bash
# ==================================================================
#  Live demo script — run from the project root:  ./demo/run-demo.sh
#  Press ENTER to run each step.  AUTO=1 ./demo/run-demo.sh runs all.
#  (English in the terminal on purpose: Arabic does not render well there)
# ==================================================================
set -u
cd "$(dirname "$0")/.."

B="\033[1m"; C="\033[36m"; G="\033[32m"; Y="\033[33m"; N="\033[0m"
URL="http://localhost:8080"

step() {
  local n="$1" title="$2" cmd="$3"
  echo -e "\n${B}${C}[$n] ${title}${N}"
  echo -e "${Y}\$ ${cmd}${N}"
  [ "${AUTO:-0}" = "1" ] && sleep 1 || read -r -p "   ↵ ENTER to run " _
  eval "$cmd"
}
pause() { echo -e "${G}→ $1${N}"; [ "${AUTO:-0}" = "1" ] && sleep 2 || read -r -p "   ↵ ENTER to continue " _; }

docker compose down -v --remove-orphans >/dev/null 2>&1
docker rm -f single >/dev/null 2>&1
docker rmi demo-app:2.0.0 >/dev/null 2>&1

step 1  "Docker is installed"                      "docker --version"
step 2  "The template: one short Dockerfile"      "grep -vE '^\\s*(#|$)' Dockerfile"
step 3  "Build the image from the template"       "docker build -t demo-app:1.0.0 ."
step 4  "The image is ready"                      "docker images demo-app"
step 5  "Run ONE container"                       "docker run -d --name single -p 8080:8080 demo-app:1.0.0 && sleep 3 && curl -s $URL/health; echo"
pause   "Open $URL in the browser"
step 6  "Security: runs as a normal user (not root)" "docker exec single id"
step 7  "Remove it"                               "docker rm -f single"
step 8  "Full environment in ONE command (proxy + 3 apps + redis)" "docker compose up -d && sleep 5 && docker compose ps"
pause   "Refresh $URL — watch different containers answer"
step 9  "Scale out: 3 → 5 copies"                 "docker compose up -d --scale app=5 && docker compose ps app"
step 10 "Self-healing: crash one container"       "curl -s -X POST $URL/crash; echo; sleep 1; docker compose ps app"
pause   "It is back automatically"
step 11 "Update to version 2.0 (new image)"       "APP_VERSION=2.0.0 docker compose up -d --build app && docker images demo-app"
pause   "Refresh $URL — v2.0.0, green header, visits kept"
step 12 "Rollback to 1.0 in seconds"              "APP_VERSION=1.0.0 docker compose up -d app && docker compose ps app"
step 13 "Central logs from all copies"            "docker compose logs --tail 3 app"
echo -e "\n${B}${G}Demo finished.${N}  Clean up with:  docker compose down -v"
