# ======================
# 1️⃣ BUILD STAGE
# ======================
FROM node:20 AS builder
WORKDIR /app

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
