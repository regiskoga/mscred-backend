import { FastifyInstance } from 'fastify';
import { create, listUsers, update, deleteUser } from '../controllers/users.controller';
import { verifyJWT } from '../middlewares/verify-jwt';
import { verifyUserRole } from '../middlewares/verify-user-role';

export async function usersRoutes(app: FastifyInstance) {
    // Apenas Admins podem criar e definir escopos de papéis e lojas para novos colaboradores. Zero-Trust Strict.
    app.post(
        '/users',
        { onRequest: [verifyJWT, verifyUserRole('ADMIN')] },
        create
    );

    // Gestores e Admins podem listar. O Controller aplica o filtro de escopo por store.
    app.get('/users', { onRequest: [verifyJWT, verifyUserRole('GESTOR')] }, listUsers);

    // Apenas admins podem atualizar ou deletar usuários
    app.patch('/users/:id', { onRequest: [verifyJWT, verifyUserRole('ADMIN')] }, update);
    app.delete('/users/:id', { onRequest: [verifyJWT, verifyUserRole('ADMIN')] }, deleteUser);
}
