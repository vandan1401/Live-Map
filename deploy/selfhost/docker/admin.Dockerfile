# The super-admin service (docs/plans/36.md). Node 24 runs the TypeScript directly (type
# stripping), so there is no build step; only the production dependency (supabase-js) is installed.
# Build context is the repo root. This image is the only one that ever receives the service-role
# key, and only at run time from the environment.
FROM node:24-slim
RUN npm install -g pnpm@9.15.0
WORKDIR /app
COPY apps/map/package.json apps/map/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
COPY apps/map/admin-portal ./admin-portal
COPY apps/map/src ./src
USER node
ENV ADMIN_HOST=0.0.0.0 ADMIN_PORT=3001
EXPOSE 3001
CMD ["node", "admin-portal/server.ts"]
