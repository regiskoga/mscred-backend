import { FastifyInstance } from 'fastify';
import { verifyJWT } from '../middlewares/verify-jwt';
import { verifyUserRole } from '../middlewares/verify-user-role';
import { TiersController } from '../controllers/tiers.controller';

const tiersController = new TiersController();

export async function tiersRoutes(app: FastifyInstance) {
    app.addHook('onRequest', verifyJWT);

    // Tiers are strictly financial config, protect with ADMIN only
    app.post('/commission-tiers', { preHandler: [verifyUserRole('ADMIN')] }, tiersController.create);
    app.get('/commission-tiers', { preHandler: [verifyUserRole('GESTOR')] }, tiersController.list);
    app.put('/commission-tiers/:id', { preHandler: [verifyUserRole('ADMIN')] }, tiersController.update);
    app.delete('/commission-tiers/:id', { preHandler: [verifyUserRole('ADMIN')] }, tiersController.delete);
}
