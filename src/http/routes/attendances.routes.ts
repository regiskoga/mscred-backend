import { FastifyInstance } from 'fastify';
import { createAttendance, listAttendances, updateAttendance } from '../controllers/attendances.controller';
import { verifyJWT } from '../middlewares/verify-jwt';

export async function attendancesRoutes(app: FastifyInstance) {
    // Rotas da Entidade Principal de Atendimentos

    // Todos podem listar, criar e editar (limites de segurança aplicados no Controller)
    app.post('/attendances', { onRequest: [verifyJWT] }, createAttendance);
    app.get('/attendances', { onRequest: [verifyJWT] }, listAttendances);
    app.put('/attendances/:id', { onRequest: [verifyJWT] }, updateAttendance);
}
