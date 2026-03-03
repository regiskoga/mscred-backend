import { FastifyReply, FastifyRequest } from 'fastify';

export function verifyUserRole(roleToVerify: 'ADMIN' | 'GESTOR' | 'OPERADOR') {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        // A role é extraída automaticamente na verificação do VerifyJWT anterior e plugada no request.user global.
        const { role } = request.user as any;

        // Hierarchy based access
        if (role === 'ADMIN') return; // Admin faz tudo

        if (roleToVerify === 'GESTOR' && role === 'OPERADOR') {
            return reply.status(403).send({ message: 'Ação não permitida. Apenas Gestores e Admins.' });
        }

        if (roleToVerify === role) {
            return;
        }

        return reply.status(403).send({ message: 'Ação não permitida para o seu cargo.' });
    };
}
