# ======================
# 1️⃣ BUILD STAGE
# ======================
FROM node:20 AS builder
WORKDIR /app

# The API proxy target is resolved while Next.js builds the standalone app.
# Docker Compose can override this for local staging; deployed images keep the
# default from next.config.mjs (http://backend:8081).
ARG API_PROXY_TARGET
ENV API_PROXY_TARGET=${API_PROXY_TARGET}

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ======================
# 2️⃣ RUNTIME STAGE
# ======================
FROM node:20-slim
WORKDIR /app

# ⬇️ COPY STANDALONE OUTPUT (INI KUNCI)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
