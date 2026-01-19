# Stage 1: Build React (Vite) app
FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Accept build arguments for Vite environment variables
ARG VITE_API_BASE_URL
ARG VITE_SOCKET_URL
ARG VITE_PYTHON_BACKEND_URL

# Set environment variables for build
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_SOCKET_URL=${VITE_SOCKET_URL}
ENV VITE_PYTHON_BACKEND_URL=${VITE_PYTHON_BACKEND_URL}

RUN npm run build

# Stage 2: Nginx
FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
