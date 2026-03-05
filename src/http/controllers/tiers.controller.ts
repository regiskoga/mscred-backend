import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';

export class TiersController {
    async create(request: FastifyRequest, reply: FastifyReply) {
        const createTierSchema = z.object({
            product_id: z.number().int().positive(),
            min_value: z.number().min(0),
            max_value: z.number().nullable().optional(),
            percentage: z.number().min(0).max(100),
        });

        const data = createTierSchema.parse(request.body);

        // Validation to prevent overlapping or inconsistent tiers could go here
        if (data.max_value !== null && data.max_value !== undefined && data.min_value >= data.max_value) {
            return reply.status(400).send({ message: 'Valor mínimo não pode ser maior ou igual ao máximo.' });
        }

        const tier = await prisma.commissionTier.create({
            data: {
                product_id: data.product_id,
                min_value: data.min_value,
                max_value: data.max_value || null,
                percentage: data.percentage,
            },
        });

        // SecOps: Audit Trail
        await prisma.auditLog.create({
            data: {
                action: 'INSERT',
                table_name: 'commission_tiers',
                record_id: tier.id.toString(),
                new_payload: tier,
                user_id: (request.user as any).sub,
                ip_address: request.ip,
            }
        });

        return reply.status(201).send(tier);
    }

    async list(request: FastifyRequest, reply: FastifyReply) {
        const querySchema = z.object({
            product_id: z.coerce.number().optional()
        });

        const { product_id } = querySchema.parse(request.query);

        const tiers = await prisma.commissionTier.findMany({
            where: product_id ? { product_id } : {},
            include: {
                product: { select: { name: true } },
            },
            orderBy: [{ product_id: 'asc' }, { min_value: 'asc' }]
        });

        return reply.send(tiers);
    }

    async update(request: FastifyRequest, reply: FastifyReply) {
        const paramsSchema = z.object({ id: z.coerce.number() });
        const updateTierSchema = z.object({
            min_value: z.number().min(0),
            max_value: z.number().nullable().optional(),
            percentage: z.number().min(0).max(100),
        });

        const { id } = paramsSchema.parse(request.params);
        const data = updateTierSchema.parse(request.body);

        if (data.max_value !== null && data.max_value !== undefined && data.min_value >= data.max_value) {
            return reply.status(400).send({ message: 'Valor mínimo não pode ser maior ou igual ao máximo.' });
        }

        const oldTier = await prisma.commissionTier.findUnique({ where: { id } });
        if (!oldTier) return reply.status(404).send({ message: 'Faixa não encontrada.' });

        const tier = await prisma.commissionTier.update({
            where: { id },
            data: {
                min_value: data.min_value,
                max_value: data.max_value || null,
                percentage: data.percentage,
            },
        });

        await prisma.auditLog.create({
            data: {
                action: 'UPDATE',
                table_name: 'commission_tiers',
                record_id: tier.id.toString(),
                old_payload: oldTier,
                new_payload: tier,
                user_id: (request.user as any).sub,
                ip_address: request.ip,
            }
        });

        return reply.send(tier);
    }

    async delete(request: FastifyRequest, reply: FastifyReply) {
        const paramsSchema = z.object({ id: z.coerce.number() });
        const { id } = paramsSchema.parse(request.params);

        const oldTier = await prisma.commissionTier.findUnique({ where: { id } });
        if (!oldTier) return reply.status(404).send({ message: 'Faixa não encontrada.' });

        await prisma.commissionTier.delete({ where: { id } });

        await prisma.auditLog.create({
            data: {
                action: 'DELETE',
                table_name: 'commission_tiers',
                record_id: id.toString(),
                old_payload: oldTier,
                user_id: (request.user as any).sub,
                ip_address: request.ip,
            }
        });

        return reply.status(204).send();
    }
}
