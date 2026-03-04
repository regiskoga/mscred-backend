import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';

export async function createStore(request: FastifyRequest, reply: FastifyReply) {
    const createStoreBodySchema = z.object({
        name: z.string().min(3),
        address: z.string().optional(),
        bmg_code: z.string().optional(),
    });

    const { name, address, bmg_code } = createStoreBodySchema.parse(request.body);

    if (bmg_code) {
        const storeExists = await prisma.store.findUnique({ where: { bmg_code } });
        if (storeExists) {
            return reply.status(409).send({ message: 'Código MSCRED da Loja já está em uso.' });
        }
    }

    const store = await prisma.store.create({
        data: { name, address, bmg_code },
    });

    return reply.status(201).send({ store });
}

export async function listStores(request: FastifyRequest, reply: FastifyReply) {
    // Nível de visão baseada em cargo (RBAC)
    const user = request.user as { role: string; store_id: number | null };

    let queryFilter = {};

    // Se o usuário for Gestor ou Operador, não retornamos todas as lojas - listamos APENAS a própria loja (Zero-Trust Privacy)
    if (user.role !== 'ADMIN') {
        queryFilter = { id: user.store_id || 0 };
    }

    const stores = await prisma.store.findMany({
        where: queryFilter,
    });

    return reply.send({ stores });
}

export async function updateStore(request: FastifyRequest, reply: FastifyReply) {
    const updateStoreParamsSchema = z.object({ id: z.coerce.number() });
    const updateStoreBodySchema = z.object({
        name: z.string().min(3).optional(),
        address: z.string().optional(),
        bmg_code: z.string().optional(),
    });

    const { id } = updateStoreParamsSchema.parse(request.params);
    const { name, address, bmg_code } = updateStoreBodySchema.parse(request.body);

    const storeExists = await prisma.store.findUnique({ where: { id } });
    if (!storeExists) {
        return reply.status(404).send({ message: 'Loja não encontrada.' });
    }

    if (bmg_code && bmg_code !== storeExists.bmg_code) {
        const bmgExists = await prisma.store.findFirst({ where: { bmg_code } });
        if (bmgExists) {
            return reply.status(409).send({ message: 'Código MSCRED da Loja já está em uso por outra unidade.' });
        }
    }

    const store = await prisma.store.update({
        where: { id },
        data: { name, address, bmg_code },
    });

    return reply.status(200).send({ store });
}
