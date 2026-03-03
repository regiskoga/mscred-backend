import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import bcrypt from 'bcryptjs';

export async function login(request: FastifyRequest, reply: FastifyReply) {
    // SecOps: Sanitização de Body com Zod para blindagem de payload
    const loginBodySchema = z.object({
        email: z.string().email(),
        password: z.string().min(6), // Minimum password length pre-check
    });

    const { email, password } = loginBodySchema.parse(request.body);

    const user = await prisma.user.findUnique({
        where: { email },
        include: { role: true },
    });

    // Zero-Trust: Falha genérica para evitar User Enumeration
    if (!user || user.deleted_at) {
        return reply.status(401).send({ message: 'Credenciais inválidas.' });
    }

    const doMatch = await bcrypt.compare(password, user.password_hash);
    if (!doMatch) {
        return reply.status(401).send({ message: 'Credenciais inválidas.' });
    }

    // Auditing Trail Log for successful login is handled inside a separate logger worker
    request.server.log.info(`Usuário logado: ${user.id} - ${user.email}`);

    // Generates the JWT Token payload with strict User Info
    const token = await reply.jwtSign(
        {
            role: user.role.name,
            store_id: user.store_id, // GESTORES operam apenas sobre a store_id presente aqui
        },
        {
            sign: {
                sub: user.id, // ID na Subject do Token
                expiresIn: '8h', // Expirar token no final do turno
            },
        }
    );

    return reply.status(200).send({
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role.name,
            store_id: user.store_id
        },
    });
}
