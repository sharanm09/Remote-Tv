#!/bin/bash

# Install Coturn TURN server
# Run this script on your server (Ubuntu/Debian)

echo "Installing Coturn TURN server..."

# Update package list
sudo apt-get update

# Install coturn
sudo apt-get install -y coturn

# Enable coturn service
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/g' /etc/default/coturn

# Backup original config
sudo cp /etc/turnserver.conf /etc/turnserver.conf.backup

# Copy our config
sudo cp turnserver.conf /etc/turnserver.conf

echo "Coturn installed successfully!"
echo ""
echo "IMPORTANT: Edit /etc/turnserver.conf and update:"
echo "  1. external-ip=YOUR_SERVER_PUBLIC_IP"
echo "  2. user=turnuser:turnpassword (change credentials)"
echo ""
echo "Then restart coturn:"
echo "  sudo systemctl restart coturn"
echo "  sudo systemctl enable coturn"
echo ""
echo "Check status:"
echo "  sudo systemctl status coturn"
echo ""
echo "Open firewall ports:"
echo "  sudo ufw allow 3478/tcp"
echo "  sudo ufw allow 3478/udp"
echo "  sudo ufw allow 5349/tcp"
echo "  sudo ufw allow 10000:20000/udp"

