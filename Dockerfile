FROM node:26-alpine AS builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

FROM node:26-alpine AS runner
WORKDIR /app/server
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/.next ./.next
COPY --from=builder /app/server/server.mjs ./server.mjs
COPY --from=builder /app/server/public ./public
COPY --from=builder /app/server/package.json ./package.json
COPY packages/ /app/packages/
EXPOSE 3000
CMD ["node", "server.mjs"]
