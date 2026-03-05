import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';

export class GoalsController {
    async create(request: FastifyRequest, reply: FastifyReply) {
        const createGoalSchema = z.object({
            product_id: z.number().int().positive(),
            store_id: z.number().int().positive().nullable().optional(),
            user_id: z.string().uuid().nullable().optional(),
            month: z.number().int().min(1).max(12),
            year: z.number().int().min(2000),
            target: z.number().min(0),
        });

        const data = createGoalSchema.parse(request.body);

        try {
            const goal = await prisma.goal.create({
                data: {
                    product_id: data.product_id,
                    store_id: data.store_id || null,
                    user_id: data.user_id || null,
                    month: data.month,
                    year: data.year,
                    target: data.target,
                },
            });

            // SecOps: Audit Trail
            await prisma.auditLog.create({
                data: {
                    action: 'INSERT',
                    table_name: 'goals',
                    record_id: goal.id.toString(),
                    new_payload: goal,
                    user_id: (request.user as any).sub,
                    ip_address: request.ip,
                }
            });

            return reply.status(201).send(goal);
        } catch (error: any) {
            // Handle unique constraint failure
            if (error.code === 'P2002') {
                return reply.status(409).send({ message: 'Meta já cadastrada para este produto/período.' });
            }
            throw error;
        }
    }

    async list(request: FastifyRequest, reply: FastifyReply) {
        const querySchema = z.object({
            month: z.coerce.number().optional(),
            year: z.coerce.number().optional(),
            product_id: z.coerce.number().optional()
        });

        const { month, year, product_id } = querySchema.parse(request.query);

        // Operadores veem apenas suas metas globais, da sua loja ou as suas próprias
        const goals = await prisma.goal.findMany({
            where: {
                ...(month ? { month } : {}),
                ...(year ? { year } : {}),
                ...(product_id ? { product_id } : {})
            },
            include: {
                product: { select: { name: true } },
                store: { select: { name: true } },
                user: { select: { name: true } },
            },
            orderBy: [{ year: 'desc' }, { month: 'desc' }, { product_id: 'asc' }]
        });

        return reply.send(goals);
    }

    async update(request: FastifyRequest, reply: FastifyReply) {
        const paramsSchema = z.object({ id: z.coerce.number() });
        const updateGoalSchema = z.object({
            target: z.number().min(0),
        });

        const { id } = paramsSchema.parse(request.params);
        const data = updateGoalSchema.parse(request.body);

        const oldGoal = await prisma.goal.findUnique({ where: { id } });
        if (!oldGoal) return reply.status(404).send({ message: 'Meta não encontrada.' });

        const goal = await prisma.goal.update({
            where: { id },
            data: { target: data.target },
        });

        await prisma.auditLog.create({
            data: {
                action: 'UPDATE',
                table_name: 'goals',
                record_id: goal.id.toString(),
                old_payload: oldGoal,
                new_payload: goal,
                user_id: (request.user as any).sub,
                ip_address: request.ip,
            }
        });

        return reply.send(goal);
    }

    async delete(request: FastifyRequest, reply: FastifyReply) {
        const paramsSchema = z.object({ id: z.coerce.number() });
        const { id } = paramsSchema.parse(request.params);

        const oldGoal = await prisma.goal.findUnique({ where: { id } });
        if (!oldGoal) return reply.status(404).send({ message: 'Meta não encontrada.' });

        await prisma.goal.delete({ where: { id } });

        await prisma.auditLog.create({
            data: {
                action: 'DELETE',
                table_name: 'goals',
                record_id: id.toString(),
                old_payload: oldGoal,
                user_id: (request.user as any).sub,
                ip_address: request.ip,
            }
        });

        return reply.status(204).send();
    }
}
