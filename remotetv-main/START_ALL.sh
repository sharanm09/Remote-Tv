#!/bin/bash

# Start All Services Script
echo "🚀 Starting all services..."
echo ""

# Colors
GREEN='\033[0.32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Function to check if port is in use
check_port() {
    lsof -i:$1 >/dev/null 2>&1
    return $?
}

# Check and kill existing processes
echo "🧹 Cleaning up existing processes..."
pkill -f "nodemon src/server.js" 2>/dev/null
pkill -f "vite" 2>/dev/null
pkill -f "python main.py" 2>/dev/null
sleep 2

# Start Python Backend (Remote Control)
echo ""
echo "${BLUE}📡 Starting Python Backend (Port 8000)...${NC}"
cd python-backend
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate
pip install -q -r requirements.txt
python main.py > ../logs/python-backend.log 2>&1 &
PYTHON_PID=$!
cd ..

sleep 2
if check_port 8000; then
    echo "${GREEN}✅ Python Backend running on https://72.60.101.240:8000${NC}"
else
    echo "${RED}❌ Python Backend failed to start${NC}"
fi

# Start Node.js Backend (Camera Streaming)
echo ""
echo "${BLUE}📡 Starting Node.js Backend (Port 3001)...${NC}"
cd backend
SERVER_IP=72.60.101.240 npm run dev > ../logs/node-backend.log 2>&1 &
NODE_PID=$!
cd ..

sleep 3
if check_port 3001; then
    echo "${GREEN}✅ Node.js Backend running on https://localhost:3001${NC}"
    echo "${GREEN}   Network: https://72.60.101.240:3001${NC}"
else
    echo "${RED}❌ Node.js Backend failed to start${NC}"
fi

# Start React Frontend
echo ""
echo "${BLUE}🎨 Starting React Frontend (Port 3000)...${NC}"
cd frontend
VITE_SERVER_URL=https://72.60.101.240:3001 npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

sleep 3
if check_port 3000; then
    echo "${GREEN}✅ React Frontend running on https://localhost:3000${NC}"
    echo "${GREEN}   Network: https://72.60.101.240:3000${NC}"
else
    echo "${RED}❌ React Frontend failed to start${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "${GREEN}🎉 All services started successfully!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📱 Access URLs:"
echo "   Frontend:  https://localhost:3000"
echo "   Stream:    https://localhost:3000/stream"
echo "   Live:      https://localhost:3000/live"
echo ""
echo "🌐 Network Access (from other devices):"
echo "   Frontend:  https://72.60.101.240:3000"
echo ""
echo "🔑 Default Password: ifocus@123"
echo ""
echo "📋 API Status:"
echo "   Node.js:  https://localhost:3001"
echo "   Python:   https://72.60.101.240:8000"
echo "   API Docs: https://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for user interrupt
wait

