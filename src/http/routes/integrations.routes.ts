import { FastifyInstance } from 'fastify';
import { verifyJWT } from '../middlewares/verify-jwt';
import { verifyUserRole } from '../middlewares/verify-user-role';
import { updateUserSheetId, syncGoogleSheets } from '../controllers/integrations.controller';

export async function integrationsRoutes(app: FastifyInstance) {
    // Todas as rotas de integração exigem autenticação e privilégio de ADMIN
    app.addHook('onRequest', verifyJWT);
    app.addHook('onRequest', verifyUserRole('ADMIN'));

    app.patch('/integrations/google-sheets/users/:id/sheet', updateUserSheetId);
    app.post('/integrations/google-sheets/sync', syncGoogleSheets);
}
