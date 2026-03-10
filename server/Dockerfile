# ============================================================
# Express Pizza — API Server Dockerfile
# ============================================================

FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY prisma ./prisma
COPY src ./src

# Generate Prisma client
RUN npx prisma generate

# Copy frontend (served as static)
COPY ../index.html ../oferta.html ../css/ ../js/ ../images/ ./public/

EXPOSE 3000

# Migration + seed + start
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
