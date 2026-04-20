#!/bin/bash
# Deploy Starbound Tactics to DigitalOcean
set -e

SERVER="root@143.110.131.237"
SSH_KEY="~/.ssh/id_ed25519"
DEPLOY_PATH="/var/www/PlasmaSim"

echo "Deploying Starbound Tactics to $SERVER..."

rsync -avz --exclude='.git' --exclude='node_modules' --exclude='data/*.json' \
  -e "ssh -i $SSH_KEY" \
  ./ "$SERVER:$DEPLOY_PATH/"

ssh -i "$SSH_KEY" "$SERVER" "
  cd $DEPLOY_PATH
  npm install --production
  systemctl restart plasmasim
  sleep 2
  systemctl is-active plasmasim
"

echo "Deployed. Game: http://143.110.131.237/  Plasma: http://143.110.131.237/plasma/"
