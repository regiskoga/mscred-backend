import { FastifyInstance } from 'fastify';
import { createHoliday } from './create-holiday';
import { getHolidays } from './get-holidays';
import { updateHoliday } from './update-holiday';
import { deleteHoliday } from './delete-holiday';
import { verifyJWT } from '../../middlewares/verify-jwt';
import { verifyUserRole } from '../../middlewares/verify-user-role';

export async function holidayRoutes(app: FastifyInstance) {
    const adminOnly = [verifyJWT, verifyUserRole('ADMIN')];

    app.post('/holidays', { onRequest: adminOnly }, createHoliday);
    app.get('/holidays', { onRequest: adminOnly }, getHolidays);
    app.put('/holidays/:id', { onRequest: adminOnly }, updateHoliday);
    app.delete('/holidays/:id', { onRequest: adminOnly }, deleteHoliday);
}
