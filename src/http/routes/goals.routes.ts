import { FastifyInstance } from 'fastify';
import { verifyJWT } from '../middlewares/verify-jwt';
import { verifyUserRole } from '../middlewares/verify-user-role';
import { GoalsController } from '../controllers/goals.controller';

const goalsController = new GoalsController();

export async function goalsRoutes(app: FastifyInstance) {
    // Only Admin can manage goals for now, or Gestor depending on business rules
    // Let's protect entirely with ADMIN to ensure Zero-Trust initially
    app.addHook('onRequest', verifyJWT);

    app.post('/goals', { preHandler: [verifyUserRole('GESTOR')] }, goalsController.create);
    app.get('/goals', { preHandler: [verifyUserRole('OPERADOR')] }, goalsController.list);
    app.put('/goals/:id', { preHandler: [verifyUserRole('GESTOR')] }, goalsController.update);
    app.delete('/goals/:id', { preHandler: [verifyUserRole('GESTOR')] }, goalsController.delete);
}
