#!/bin/bash

# Define variables
REMOTE_SERVER="rulepop.com"
REMOTE_DIR="/var/www/cwdmdc.patrickdwyer.com"
LOCAL_DIR="dist/"

# Execute rsync command to sync files and capture the output
echo "Deploying files..."
rsync_output=$(rsync -av --checksum --delete --itemize-changes --exclude=".DS_Store" "$LOCAL_DIR" "root@$REMOTE_SERVER:$REMOTE_DIR" | grep -E '(^\*deleting|^<f)')

# Display the rsync changes
echo "Files transferred, changed, or deleted:"
echo "$rsync_output"

# Run chown command on the remote server to set permissions
ssh "root@$REMOTE_SERVER" "chown -R www-data:www-data $REMOTE_DIR"

# Display completion message
echo "Deployment complete."
