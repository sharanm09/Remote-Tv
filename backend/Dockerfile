FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Optional but recommended
EXPOSE 5000

# Cloud Run will set PORT automatically
CMD ["npm", "start"]
