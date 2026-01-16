#!/bin/bash
# Quick start script - starts both services on VM

VM_HOST="72.61.240.130"
VM_USER="root"

echo "🚀 Starting RemoteTv services on VM..."
ssh "$VM_USER@$VM_HOST" << 'ENDSSH'
cd /opt/remotetv

# Stop existing services
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# Start both services
pm2 start ecosystem.config.js

# Show status
sleep 2
pm2 status

echo ""
echo "✅ Services started!"
echo "Frontend: http://72.61.240.130:4000"
echo "Backend:  http://72.61.240.130:5000"
ENDSSH
