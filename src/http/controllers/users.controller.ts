import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import bcrypt from 'bcryptjs';

export async function create(request: FastifyRequest, reply: FastifyReply) {
    const registerBodySchema = z.object({
        name: z.string().min(3),
        email: z.string().email(),
        password: z.string().min(6), // A plain password gets safely hashed below
        role_id: z.number().int(),
        // store_id should only be handled if the role is operator/gestor
        store_id: z.number().int().optional(),
    });

    const { name, email, password, role_id, store_id } = registerBodySchema.parse(
        request.body
    );

    const userWithSameEmail = await prisma.user.findUnique({
        where: { email },
    });

    if (userWithSameEmail) {
        return reply.status(409).send({ message: 'E-mail indisponível.' });
    }

    // OWASP: Segurança por ofuscação de hash robusto Bcrypt (Work Factor Automático)
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
        data: {
            name,
            email,
            password_hash,
            role_id,
            store_id,
        },
    });

    // Não retornamos o Password Hash jamais em respostas de API conforme regra #2 de Privacidade
    return reply.status(201).send({
        message: 'Usuário Inserido na Trilha com Sucesso.',
        user: { id: user.id, email: user.email },
    });
}

export async function listUsers(request: FastifyRequest, reply: FastifyReply) {
    const { role, store_id } = request.user as any;

    let queryFilter: any = { deleted_at: null };

    if (role === 'GESTOR') {
        queryFilter.store_id = store_id;
    }

    const users = await prisma.user.findMany({
        where: queryFilter,
        select: { id: true, name: true, email: true, role: true, store: true, created_at: true }
    });

    return reply.send({ users });
}

export async function updateUserRole(request: FastifyRequest, reply: FastifyReply) {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({ role_id: z.number().int() });

    const { id } = paramsSchema.parse(request.params);
    const { role_id } = bodySchema.parse(request.body);

    const updatedUser = await prisma.user.update({
        where: { id },
        data: { role_id },
        select: { id: true, email: true, role: true }
    });

    return reply.send({ message: 'Cargo atualizado com sucesso.', user: updatedUser });
}

export async function deleteUser(request: FastifyRequest, reply: FastifyReply) {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const { id } = paramsSchema.parse(request.params);

    await prisma.user.update({
        where: { id },
        data: { deleted_at: new Date() }
    });

    return reply.status(204).send();
}
