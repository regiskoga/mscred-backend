import { FastifyInstance } from 'fastify';
import { getProfile, updateProfile } from '../controllers/profile.controller';
import { verifyJWT } from '../middlewares/verify-jwt';

export async function profileRoutes(app: FastifyInstance) {
    // Escopo Pessoal Estrito (Apenas autenticados, independente do cargo)
    app.get('/profile/me', { onRequest: [verifyJWT] }, getProfile);

    // Auto-Atualização blindada de Foto, Telefone e Senha
    app.put('/profile/me', { onRequest: [verifyJWT] }, updateProfile);
}
