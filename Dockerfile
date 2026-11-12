FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

# 完整构建管线:客户端产物 + SSR bundle + 预渲染 + sitemap/robots
RUN npm run build && npm run build-ssr && node scripts/prerender.ts

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
