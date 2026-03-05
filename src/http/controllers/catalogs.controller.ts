import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma';
import { z } from 'zod';

export async function getAllProducts(request: FastifyRequest, reply: FastifyReply) {
    const products = await prisma.product.findMany({
        where: { active: true },
        orderBy: [
            { sort_order: 'asc' },
            { name: 'asc' }
        ]
    });
    return reply.send({ products });
}

export async function getAllOperationTypes(request: FastifyRequest, reply: FastifyReply) {
    const types = await prisma.operationType.findMany({ where: { active: true } });
    return reply.send({ operationTypes: types });
}

export async function getAllAttendanceStatuses(request: FastifyRequest, reply: FastifyReply) {
    const statuses = await prisma.attendanceStatus.findMany({ where: { active: true } });
    return reply.send({ attendanceStatuses: statuses });
}

export async function getAllSalesChannels(request: FastifyRequest, reply: FastifyReply) {
    const channels = await prisma.salesChannel.findMany({ where: { active: true } });
    return reply.send({ salesChannels: channels });
}

// Controller genérico para Admins criarem novas opções em catálogos dinâmicos
export async function createCatalogItem(request: FastifyRequest, reply: FastifyReply) {
    const paramsSchema = z.object({
        type: z.enum(['products', 'operation_types', 'attendance_statuses', 'sales_channels'])
    });
    const bodySchema = z.object({
        name: z.string().min(2),
        sort_order: z.number().int().optional()
    });

    const { type } = paramsSchema.parse(request.params);
    const { name, sort_order } = bodySchema.parse(request.body);

    let createdRecord;
    // Map of Prisma delegates dynamically
    switch (type) {
        case 'products':
            createdRecord = await prisma.product.create({
                data: { name, sort_order: sort_order || 0 }
            });
            break;
        case 'operation_types':
            createdRecord = await prisma.operationType.create({ data: { name } });
            break;
        case 'attendance_statuses':
            createdRecord = await prisma.attendanceStatus.create({ data: { name } });
            break;
        case 'sales_channels':
            createdRecord = await prisma.salesChannel.create({ data: { name } });
            break;
    }

    return reply.status(201).send({ message: 'Item cadastrado com sucesso', data: createdRecord });
}

export async function updateCatalogItem(request: FastifyRequest, reply: FastifyReply) {
    const paramsSchema = z.object({
        type: z.enum(['products', 'operation_types', 'attendance_statuses', 'sales_channels']),
        id: z.coerce.number()
    });
    const bodySchema = z.object({
        name: z.string().min(2).optional(),
        sort_order: z.number().int().optional()
    });

    const { type, id } = paramsSchema.parse(request.params);
    const { name, sort_order } = bodySchema.parse(request.body);

    let updatedRecord;
    switch (type) {
        case 'products':
            updatedRecord = await prisma.product.update({
                where: { id },
                data: {
                    ...(name ? { name } : {}),
                    ...(sort_order !== undefined ? { sort_order } : {})
                }
            });
            break;
        case 'operation_types':
            updatedRecord = await prisma.operationType.update({ where: { id }, data: { name: name! } });
            break;
        case 'attendance_statuses':
            updatedRecord = await prisma.attendanceStatus.update({ where: { id }, data: { name: name! } });
            break;
        case 'sales_channels':
            updatedRecord = await prisma.salesChannel.update({ where: { id }, data: { name: name! } });
            break;
    }

    return reply.status(200).send({ message: 'Item atualizado com sucesso', data: updatedRecord });
}

export async function toggleCatalogItemStatus(request: FastifyRequest, reply: FastifyReply) {
    const paramsSchema = z.object({
        type: z.enum(['products', 'operation_types', 'attendance_statuses', 'sales_channels']),
        id: z.coerce.number()
    });
    const bodySchema = z.object({
        active: z.boolean()
    });

    const { type, id } = paramsSchema.parse(request.params);
    const { active } = bodySchema.parse(request.body);

    let updatedRecord;
    switch (type) {
        case 'products':
            updatedRecord = await prisma.product.update({ where: { id }, data: { active } });
            break;
        case 'operation_types':
            updatedRecord = await prisma.operationType.update({ where: { id }, data: { active } });
            break;
        case 'attendance_statuses':
            updatedRecord = await prisma.attendanceStatus.update({ where: { id }, data: { active } });
            break;
        case 'sales_channels':
            updatedRecord = await prisma.salesChannel.update({ where: { id }, data: { active } });
            break;
    }

    return reply.status(200).send({ message: `Status alterado para ${active ? 'Ativo' : 'Inativo'}`, data: updatedRecord });
}
