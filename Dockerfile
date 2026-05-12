# ─── Stage 1: deps ───────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ─── Stage 2: build (frontend Vite) ──────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Gera o Prisma client
RUN npx prisma generate

# ─── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Usuário não-root para segurança
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copia dependências de produção
COPY --from=deps /app/node_modules ./node_modules

# Copia build do frontend
COPY --from=builder /app/dist ./dist

# Copia backend e schema Prisma (necessário para migrate deploy)
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

# Copia client gerado do Prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

USER appuser

# Migra e inicia o servidor
CMD ["sh", "-c", "npx prisma migrate deploy && node backend/server.js"]
