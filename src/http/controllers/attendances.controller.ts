import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';

export async function createAttendance(request: FastifyRequest, reply: FastifyReply) {
    const attendanceBodySchema = z.object({
        customer_name: z.string().min(3),
        customer_cpf: z.string().length(11), // Pre-validation size (Clean)
        attendance_date: z.string().transform((str) => new Date(str)),
        product_id: z.number().int(),
        operation_type_id: z.number().int(),
        attendance_status_id: z.number().int(),
        sales_channel_id: z.number().int(),
        paid_approved: z.boolean().default(false),
        city: z.string(),
        origin_bank: z.string().optional().nullable(),
    });

    const parsedData = attendanceBodySchema.parse(request.body);
    const { sub: user_id, store_id } = request.user as { sub: string; store_id: number };

    if (!store_id) {
        return reply.status(403).send({ message: 'Operação abortada: Colaborador sem loja vinculada.' });
    }

    const attendance = await prisma.attendance.create({
        data: {
            ...parsedData,
            user_id, // Atribuição Indissociável (Zero-Trust) baseada no JWT, não no Body
            store_id, // Vinculação forçada pela loja do colaborador logado
        },
    });

    return reply.status(201).send({ attendance });
}

export async function listAttendances(request: FastifyRequest, reply: FastifyReply) {
    const { sub: user_id, role, store_id } = request.user as any;

    let queryFilter: any = {};

    // ZERO-TRUST Data Escaping Enforcement
    if (role === 'OPERADOR') {
        queryFilter.user_id = user_id; // Só recupera o que ELE digitou
    } else if (role === 'GESTOR') {
        queryFilter.store_id = store_id; // Recupera tudo da SUA LOJA (incluindo si mesmo e seus operadores)
    }
    // Se for ADMIN, o objeto de queryFilter segue vazio == SELECT * da Base toda

    const querySchema = z.object({
        page: z.string().optional().default('1').transform(Number),
        limit: z.string().optional().default('50').transform(Number),
    });

    const { page, limit } = querySchema.parse(request.query);
    const skip = (page - 1) * limit;

    const [attendances, total] = await Promise.all([
        prisma.attendance.findMany({
            where: queryFilter,
            include: {
                product: { select: { name: true } },
                operation_type: { select: { name: true } },
                attendance_status: { select: { name: true } },
                sales_channel: { select: { name: true } },
                user: { select: { name: true } },
                store: { select: { name: true } },
            },
            orderBy: { attendance_date: 'desc' },
            skip,
            take: limit
        }),
        prisma.attendance.count({ where: queryFilter })
    ]);

    return reply.send({
        attendances,
        meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    });
}
