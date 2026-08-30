#!/usr/bin/env bash
# Reverse-SSH: expose local DSH to the agent-kernel host.
# Usage:
#   EXECUTOR_SSH_TUNNEL_TARGET=user@kernel-host \
#   REMOTE_PORT=13142 LOCAL_PORT=13080 \
#   ./scripts/dsh-reverse-tunnel.sh
#
# Keep this process running while you use agent-kernel against local DSH.
set -euo pipefail

TARGET="${EXECUTOR_SSH_TUNNEL_TARGET:?set EXECUTOR_SSH_TUNNEL_TARGET=user@host}"
REMOTE_PORT="${REMOTE_PORT:?set REMOTE_PORT (from Setup → SSH command)}"
LOCAL_PORT="${LOCAL_PORT:-13080}"

echo "Forwarding kernel-host:${REMOTE_PORT} → 127.0.0.1:${LOCAL_PORT} via ${TARGET}"
echo "sshd needs GatewayPorts clientspecified (or yes) on the kernel host."
exec ssh -N -o ExitOnForwardFailure=yes -R "${REMOTE_PORT}:127.0.0.1:${LOCAL_PORT}" "${TARGET}"
