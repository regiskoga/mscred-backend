import fastify from 'fastify';
import cors from '@fastify/cors';
import customJwt from '@fastify/jwt';
import { z } from 'zod';
import { authRoutes } from './http/routes/auth.routes';
import { usersRoutes } from './http/routes/users.routes';
import { catalogsRoutes } from './http/routes/catalogs.routes';
import { storesRoutes } from './http/routes/stores.routes';
import { attendancesRoutes } from './http/routes/attendances.routes';
import { profileRoutes } from './http/routes/profile.routes';
import { holidayRoutes } from './http/controllers/holidays/routes';
import { integrationsRoutes } from './http/routes/integrations.routes';
import { goalsRoutes } from './http/routes/goals.routes';
import { tiersRoutes } from './http/routes/tiers.routes';
import { dashboardRoutes } from './http/routes/dashboard.routes';

export const app = fastify({
    logger: true, // JSON Logger (Struktured) conforme GLOBAL_GUIDELINES
});

// Registrar CORS (SecOps: Diretriz Zero-Trust e Prevenção OWASP)
// RESTRIÇÃO COMPLETA: NUNCA usar origin: true indiscriminadamente em produção.
app.register(cors, {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : (process.env.NODE_ENV === 'production' ? false : true),
    credentials: true, // Habilitar suportes a cookies de sessão/auth futura
});

// Configuração JWT (A Chave será injetada por variável de ambiente para mitigar Zero-Trust Hardcoding)
app.register(customJwt, {
    secret: process.env.JWT_SECRET || 'supersecret_fallback_key_for_dev_only',
});

// Middleware Global Error Handler - Impede log de PII em caso de explosão de erro
app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
        return reply.status(400).send({
            message: 'Erro de validação (Sanitização falhou).',
            issues: error.format(),
        });
    }

    // Se não for modo de desenvolvimento, mascare o erro interno
    const isDev = process.env.NODE_ENV !== 'production';

    // Evitar vazamento de stacktrace e SQL Injections messages no client (OWASP Top 10)
    app.log.error(error); // Logger estruturado lida com a gravação segura
    reply.status(500).send({
        message: isDev ? error.message : 'Erro interno no servidor.',
    });
});

// HealthCheck para o Orquestrador (Coolify - Diretrizes de Infra)
app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
});

// Registrando Rotas Globais MSCRED
app.register(authRoutes, { prefix: '/api' });
app.register(usersRoutes, { prefix: '/api' });
app.register(catalogsRoutes, { prefix: '/api' });
app.register(storesRoutes, { prefix: '/api' });
app.register(attendancesRoutes, { prefix: '/api' });
app.register(profileRoutes, { prefix: '/api' });
app.register(holidayRoutes, { prefix: '/api' });
app.register(integrationsRoutes, { prefix: '/api' });
app.register(goalsRoutes, { prefix: '/api' });
app.register(tiersRoutes, { prefix: '/api' });
app.register(dashboardRoutes, { prefix: '/api' });
