import { FastifyInstance } from 'fastify';
import {
    getAllProducts,
    getAllOperationTypes,
    getAllAttendanceStatuses,
    getAllSalesChannels,
    createCatalogItem,
    updateCatalogItem,
    toggleCatalogItemStatus
} from '../controllers/catalogs.controller';
import { verifyJWT } from '../middlewares/verify-jwt';
import { verifyUserRole } from '../middlewares/verify-user-role';

export async function catalogsRoutes(app: FastifyInstance) {
    // Leitura livre para usuários autenticados (necessário para popular dropdowns no Frontend)
    app.get('/catalogs/products', { onRequest: [verifyJWT] }, getAllProducts);
    app.get('/catalogs/operation-types', { onRequest: [verifyJWT] }, getAllOperationTypes);
    app.get('/catalogs/attendance-statuses', { onRequest: [verifyJWT] }, getAllAttendanceStatuses);
    app.get('/catalogs/sales-channels', { onRequest: [verifyJWT] }, getAllSalesChannels);

    // Escrita estritamente trancada para Administradores
    app.post(
        '/catalogs/:type',
        { onRequest: [verifyJWT, verifyUserRole('ADMIN')] },
        createCatalogItem
    );

    app.put(
        '/catalogs/:type/:id',
        { onRequest: [verifyJWT, verifyUserRole('ADMIN')] },
        updateCatalogItem
    );

    app.patch(
        '/catalogs/:type/:id/toggle',
        { onRequest: [verifyJWT, verifyUserRole('ADMIN')] },
        toggleCatalogItemStatus
    );
}
