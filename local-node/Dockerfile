# ============================================================
# Express Pizza — Local Node Dockerfile
# ============================================================

FROM node:20-alpine AS base
WORKDIR /app

# better-sqlite3 requires build tools
RUN apk add --no-cache python3 make g++

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY server.js ./
COPY src ./src

# Create data directory for SQLite
RUN mkdir -p data

EXPOSE 3001

CMD ["node", "server.js"]
