FROM node:20-alpine AS deps
WORKDIR /app

# Install client deps with local SDK present. This Dockerfile expects build context at repo root.
COPY client/package*.json ./client/
COPY packages/sdk-ts/package*.json ./packages/sdk-ts/
COPY packages/sdk-ts/dist ./packages/sdk-ts/dist

WORKDIR /app/client
RUN npm ci

FROM deps AS build
WORKDIR /app

COPY client ./client
COPY packages/sdk-ts/package.json ./packages/sdk-ts/package.json
COPY packages/sdk-ts/dist ./packages/sdk-ts/dist

WORKDIR /app/client
RUN npm run build

FROM nginx:1.27-alpine AS runner

COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
