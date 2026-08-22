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

# /health já reporta banco, Redis, workers e lag do event loop — usar o mesmo
# endpoint aqui evita um segundo conceito de "vivo" divergindo do primeiro.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `exec` é obrigatório: sem ele o `sh` fica como PID 1 e NÃO repassa SIGTERM ao
# Node. Todo o shutdown gracioso de backend/server.js (fechar servidor, parar
# workers, drenar filas, desconectar Redis e Prisma) nunca rodava — o processo
# era morto de supetão a cada deploy, no meio de qualquer job em andamento.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node backend/server.js"]
