#!/bin/bash
# Deploy claw-listener code to EC2 and restart
# Usage: ./scripts/deploy-ec2.sh [restart-only]
set -e

EC2_HOST="ubuntu@63.33.44.64"
EC2_PATH="/opt/claw-listener"
LOCAL_SRC="/Users/shay/proj/claw-listener/src/"

if [ "$1" = "restart-only" ]; then
  echo "==> Restarting claw-listener on EC2..."
  ssh $EC2_HOST "cd $EC2_PATH && pm2 restart claw-listener"
  echo "==> Done. Checking status..."
  ssh $EC2_HOST "pm2 status claw-listener"
  exit 0
fi

echo "==> Syncing source code to EC2..."
rsync -avz --exclude node_modules --exclude dist \
  "$LOCAL_SRC" "$EC2_HOST:$EC2_PATH/src/"

echo "==> Building on EC2..."
ssh $EC2_HOST "cd $EC2_PATH && npm run build"

echo "==> Restarting claw-listener..."
ssh $EC2_HOST "cd $EC2_PATH && pm2 restart claw-listener"

echo "==> Checking status..."
ssh $EC2_HOST "pm2 status claw-listener"

echo "==> Tailing logs (10 lines)..."
ssh $EC2_HOST "pm2 logs claw-listener --lines 10 --nostream"

echo ""
echo "Done! Listener restarted with new code."
echo "Watch logs: ssh $EC2_HOST 'pm2 logs claw-listener --lines 50'"
