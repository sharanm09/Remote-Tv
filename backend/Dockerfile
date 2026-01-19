FROM node:16-alpine

WORKDIR /usr/src/app

COPY package.json ./

# Force CommonJS-compatible uuid
RUN npm install uuid@8 && npm install --omit=dev

COPY . .
#COPY .env .env 

EXPOSE 5000
CMD ["npm", "start"]
