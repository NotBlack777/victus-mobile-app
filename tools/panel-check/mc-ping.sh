#!/bin/sh
#
# Minimal Minecraft server status probe: checks that the server's game port
# accepts TCP connections, which is what "the server is up" means from a
# player's point of view.
#
#   sh ./tools/panel-check/mc-ping.sh <host> [port] [label]
#
# Used to confirm from OUTSIDE the panel that a server a power action was sent
# to is actually serving players. Exit 0 = reachable, 1 = not.
#
# Uses bash's /dev/tcp rather than netcat, so it runs anywhere bash exists
# (including environments without nc). `timeout` bounds the attempt.
#
set -u

HOST=${1:?usage: mc-ping.sh <host> [port] [label]}
PORT=${2:-25565}
LABEL=${3:-$HOST:$PORT}
TIMEOUT=5

if command -v timeout >/dev/null 2>&1; then
  if timeout "$TIMEOUT" bash -c "exec 3<>/dev/tcp/$HOST/$PORT" 2>/dev/null; then
    echo "UP    $LABEL accepts TCP connections"
    exit 0
  fi
else
  if bash -c "exec 3<>/dev/tcp/$HOST/$PORT" 2>/dev/null; then
    echo "UP    $LABEL accepts TCP connections"
    exit 0
  fi
fi

echo "DOWN  $LABEL refused or timed out within ${TIMEOUT}s"
exit 1
