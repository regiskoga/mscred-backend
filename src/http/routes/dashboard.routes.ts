import { FastifyInstance } from 'fastify';
import { verifyJWT } from '../middlewares/verify-jwt';
import { verifyUserRole } from '../middlewares/verify-user-role';
import { DashboardController } from '../controllers/dashboard.controller';

const dashboardController = new DashboardController();

export async function dashboardRoutes(app: FastifyInstance) {
    app.addHook('onRequest', verifyJWT);

    // Todos os usuários autenticados podem ver o próprio dashboard, a filtragem de dados é feita via JWT
    app.get('/dashboard/metrics', { preHandler: [verifyUserRole('OPERADOR')] }, dashboardController.getMetrics);
}
