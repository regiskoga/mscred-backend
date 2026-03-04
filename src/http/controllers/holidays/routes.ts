import { FastifyInstance } from 'fastify';
import { createHoliday } from './create-holiday';
import { getHolidays } from './get-holidays';
import { updateHoliday } from './update-holiday';
import { deleteHoliday } from './delete-holiday';
import { verifyJWT } from '../../middlewares/verify-jwt';
import { verifyUserRole } from '../../middlewares/verify-user-role';

export async function holidayRoutes(app: FastifyInstance) {
    app.addHook('onRequest', verifyJWT);
    app.addHook('onRequest', verifyUserRole('ADMIN')); // Only Admin can manage holidays

    app.post('/holidays', createHoliday);
    app.get('/holidays', getHolidays);
    app.put('/holidays/:id', updateHoliday);
    app.delete('/holidays/:id', deleteHoliday);
}
