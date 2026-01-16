# Node.js Backend Dockerfile for Mediasoup Server
FROM node:20-alpine

# Install system dependencies for mediasoup
RUN apk add --no-cache \
    python3 \
    py3-pip \
    make \
    g++ \
    gcc \
    linux-headers

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Copy SSL certificates
COPY cert.pem /app/cert.pem
COPY key.pem /app/key.pem

# Expose ports
# 3001 for HTTPS API
# 40000-40100 for WebRTC media
EXPOSE 3001 40000-40100/udp 40000-40100/tcp

# Set environment variables
ENV NODE_ENV=production
ENV SERVER_IP=72.60.101.240

# Start the server
CMD ["node", "src/server.js"]

