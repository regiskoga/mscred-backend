import { FastifyInstance } from 'fastify';
import { createStore, listStores, updateStore } from '../controllers/stores.controller';
import { verifyJWT } from '../middlewares/verify-jwt';
import { verifyUserRole } from '../middlewares/verify-user-role';

export async function storesRoutes(app: FastifyInstance) {
    // Consulta de Lojas: Todo usuário logado pode consultar, mas o controller filtrará automaticamente
    app.get('/stores', { onRequest: [verifyJWT] }, listStores);

    // Criação de Lojas: Estrito para Módulo Administrador apenas.
    app.post(
        '/stores',
        { onRequest: [verifyJWT, verifyUserRole('ADMIN')] },
        createStore
    );

    // Atualização de Lojas
    app.put(
        '/stores/:id',
        { onRequest: [verifyJWT, verifyUserRole('ADMIN')] },
        updateStore
    );
}
