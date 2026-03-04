# Multi-stage Dockerfile blindado seguindo diretrizes SecOps
# Stage 1: Build
FROM node:20-alpine AS builder

# Instalar OpenSSL para o Prisma Client nativo no Alpine
RUN apk update && apk add --no-cache openssl

WORKDIR /app
# Copiando apenas dependências para cache
COPY package.json package-lock.json* ./
RUN export NODE_ENV=development && npm install --include=dev

# Copiando código fonte e prisma schema
# Corrigindo permissões para execução do Prisma Generate no builder
# Corrigindo permissões para execução do Prisma Generate no builder
COPY . .
RUN chmod +x ./node_modules/.bin/*
# Geração do cliente Prisma e compilação do TypeScript
RUN export NODE_ENV=development && npx prisma generate
RUN export NODE_ENV=development && npm run build

# Stage 2: Produção (Imagem menor e mais segura)
FROM node:20-alpine AS runner

# Instalar OpenSSL para o ambiente de produção rodar o Query Engine do Prisma
RUN apk update && apk add --no-cache openssl

WORKDIR /app

# Definindo ambiente de produção
ENV NODE_ENV=production

# Criar e alterar para usuário sem privilégios (Zero-Trust)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copiar os arquivos compilados e dependências necessárias do builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

# Mudar o proprietário dos arquivos para o appuser
RUN chown -R appuser:appgroup /app

# Switch to the non-root user
USER appuser

EXPOSE 3333

# Adicionando healthcheck para o orquestrador (Coolify)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3333/api/health || exit 1

# Comando de execução: Roda migrações pendentes, semeia o banco (upsert) e inicia o servidor
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npx prisma db seed && npm start"]
