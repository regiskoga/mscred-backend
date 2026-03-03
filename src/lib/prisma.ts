import { PrismaClient } from '@prisma/client';

// Evita aberturas múltiplas de conexões em Dev que esgotam o pool do DB
export const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'dev' ? ['query', 'error', 'warn'] : ['error'],
});
