import { FastifyInstance } from 'fastify';
import { createAttendance, listAttendances } from '../controllers/attendances.controller';
import { verifyJWT } from '../middlewares/verify-jwt';

export async function attendancesRoutes(app: FastifyInstance) {
    // Rotas da Entidade Principal de Atendimentos

    // Todos podem listar e criar, mas os Controllers filtram os limites do que o cargo tem escopo.
    app.post('/attendances', { onRequest: [verifyJWT] }, createAttendance);
    app.get('/attendances', { onRequest: [verifyJWT] }, listAttendances);
}
