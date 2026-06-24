#!/bin/bash

# ==============================================================================
# FRONTEND DEPLOYMENT SCRIPT FOR OIPA SECURITY TOOL
# ==============================================================================
# This script automates building and deploying the Angular frontend assets to 
# the remote server.
# ==============================================================================

set -e

# --- CONFIGURATION SECTION ---
SERVER_IP="10.10.3.237"
SERVER_USER="atumverse"
SERVER_PORT="22"

# Local Path (using relative path since script is in the frontend root)
LOCAL_FRONTEND_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIST_DIR="dist/security-tool-ui"

# Remote Path on the Server
REMOTE_FRONTEND_DIR="/opt/finfra/nginx/security-tool-ui"

# Nginx restart command (edit if sudo systemctl is not available or if using another command)
NGINX_RESTART_CMD="sudo systemctl restart nginx"

# Timestamp suffix for backup naming
DATE_SUFFIX=$(date +%Y%m%d_%H%M%S)

echo "======================================================================"
echo " >>> DEPLOYING FRONTEND TO $SERVER_USER@$SERVER_IP"
echo "======================================================================"

# 1. Build frontend locally
echo "[Local] Navigating to frontend directory: $LOCAL_FRONTEND_DIR"
cd "$LOCAL_FRONTEND_DIR"

echo "[Local] Building Angular app (npm run build)..."
npm run build

# Verify build output exists
if [ ! -d "$FRONTEND_DIST_DIR" ]; then
    echo "[-] Error: Frontend dist directory $FRONTEND_DIST_DIR does not exist!" >&2
    exit 1
fi
echo "[Local] Frontend built successfully: $FRONTEND_DIST_DIR"

# 2. Rename current frontend to backup with date and create new directory
echo "[Remote] Backing up existing frontend directory and preparing new target folder..."
ssh -p "$SERVER_PORT" "$SERVER_USER@$SERVER_IP" \
    "if [ -d \"$REMOTE_FRONTEND_DIR\" ]; then \
        mv \"$REMOTE_FRONTEND_DIR\" \"${REMOTE_FRONTEND_DIR}_bak_${DATE_SUFFIX}\" && \
        echo 'Backup created: ${REMOTE_FRONTEND_DIR}_bak_${DATE_SUFFIX}'; \
     fi && \
     mkdir -p \"$REMOTE_FRONTEND_DIR\""

# 3. Paste the built frontend code to the server
echo "[Local -> Remote] Copying frontend assets to server..."
scp -P "$SERVER_PORT" -r "$FRONTEND_DIST_DIR"/* "$SERVER_USER@$SERVER_IP:$REMOTE_FRONTEND_DIR/"

# 4. Verification & Nginx restart
rollback_frontend() {
    echo "[Rollback] Restoring backup frontend directory on remote server..."
    ssh -p "$SERVER_PORT" "$SERVER_USER@$SERVER_IP" \
        "rm -rf \"$REMOTE_FRONTEND_DIR\" && \
         if [ -d \"${REMOTE_FRONTEND_DIR}_bak_${DATE_SUFFIX}\" ]; then \
             mv \"${REMOTE_FRONTEND_DIR}_bak_${DATE_SUFFIX}\" \"$REMOTE_FRONTEND_DIR\" && \
             echo 'Restored backup frontend directory: $REMOTE_FRONTEND_DIR' && \
             echo 'Restarting Nginx to restore service...' && \
             $NGINX_RESTART_CMD; \
         else \
             echo 'No backup directory found to restore!'; \
         fi"
}

echo "[Remote] Verifying assets and restarting Nginx..."
if ! ssh -p "$SERVER_PORT" "$SERVER_USER@$SERVER_IP" "
    # Check if index.html was copied successfully
    if [ ! -f \"$REMOTE_FRONTEND_DIR/index.html\" ]; then
        echo 'Error: index.html not found in $REMOTE_FRONTEND_DIR!'
        exit 1
    fi
    
    # Restart Nginx
    echo 'Restarting Nginx...'
    $NGINX_RESTART_CMD
"; then
    echo "[-] Error: Frontend verification or Nginx restart failed!"
    echo "[-] Initiating frontend rollback..."
    rollback_frontend
    exit 1
fi

# Clean up older backups (keep only the last 3 for safety)
echo "[Remote] Cleaning up older backups in nginx folder..."
ssh -p "$SERVER_PORT" "$SERVER_USER@$SERVER_IP" \
    "cd \"\$(dirname $REMOTE_FRONTEND_DIR)\" && ls -td \$(basename ${REMOTE_FRONTEND_DIR})_bak_* 2>/dev/null | tail -n +4 | xargs rm -rf || true"

echo "======================================================================"
echo " >>> FRONTEND DEPLOYMENT SUCCESSFUL!"
echo "======================================================================"
