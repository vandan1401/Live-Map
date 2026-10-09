# The web app: the same image serves the SaaS-identical bundle for every deployment. Supabase
# URL/key come from /config.js written at container start (see app-entrypoint.sh), never from
# build-time VITE_* values. Build context is the repo root (the app reads contract/ + fixtures/).
FROM node:24-slim AS build
RUN npm install -g pnpm@9.15.0
WORKDIR /repo
COPY contract ./contract
COPY fixtures ./fixtures
COPY apps/map/package.json apps/map/pnpm-lock.yaml ./apps/map/
WORKDIR /repo/apps/map
RUN pnpm install --frozen-lockfile
COPY apps/map ./
RUN pnpm build

FROM nginx:1.30-alpine
COPY deploy/selfhost/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/selfhost/docker/app-entrypoint.sh /docker-entrypoint.d/40-app-config.sh
RUN chmod +x /docker-entrypoint.d/40-app-config.sh
COPY --from=build /repo/apps/map/dist /usr/share/nginx/html
EXPOSE 80
