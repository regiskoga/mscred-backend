import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import bcrypt from 'bcryptjs';

export async function getProfile(request: FastifyRequest, reply: FastifyReply) {
    const { sub: user_id } = request.user as { sub: string };

    const user = await prisma.user.findUnique({
        where: { id: user_id },
        select: {
            id: true,
            name: true,
            email: true,
            avatar_url: true,
            phone: true,
            address: true,
            role: { select: { name: true } },
            store: { select: { name: true } },
            created_at: true,
        }
    });

    if (!user) {
        return reply.status(404).send({ message: 'Perfil de Colaborador não localizado.' });
    }

    return reply.send({ user });
}

export async function updateProfile(request: FastifyRequest, reply: FastifyReply) {
    const updateProfileBodySchema = z.object({
        phone: z.string().optional().nullable(),
        address: z.string().optional().nullable(),
        avatar_url: z.string().optional().nullable(),
        password: z.string().min(6).optional().nullable(), // Password change is optional
    });

    const parsedData = updateProfileBodySchema.parse(request.body);
    const { sub: user_id } = request.user as { sub: string };

    let updatePayload: any = {
        phone: parsedData.phone,
        address: parsedData.address,
        avatar_url: parsedData.avatar_url,
    };

    // Strict Zero-Trust Password Hashing Implementation
    if (parsedData.password) {
        const salt = await bcrypt.genSalt(10);
        updatePayload.password_hash = await bcrypt.hash(parsedData.password, salt);
    }

    const updatedUser = await prisma.user.update({
        where: { id: user_id },
        data: updatePayload,
        select: {
            id: true,
            name: true,
            email: true,
            avatar_url: true,
            phone: true,
            address: true,
            role: { select: { name: true } },
            store: { select: { name: true } },
            updated_at: true,
        }
    });

    return reply.status(200).send({ user: updatedUser, message: 'Perfil modificado com sucesso.' });
}
