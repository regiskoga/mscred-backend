import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { CommissionEngineService } from '../../services/commission-engine.service';

const commissionEngine = new CommissionEngineService();

export async function createAttendance(request: FastifyRequest, reply: FastifyReply) {
    const attendanceBodySchema = z.object({
        customer_name: z.string().min(3),
        customer_cpf: z.string().length(11), // Pre-validation size (Clean)
        attendance_date: z.string().transform((str) => new Date(str)),
        product_id: z.number().int(),
        operation_type_id: z.number().int(),
        attendance_status_id: z.number().int(),
        sales_channel_id: z.number().int(),
        paid_approved: z.boolean(),
        city: z.string(),
        origin_bank: z.string().optional().nullable(),
        contract_value: z.number().min(0).optional().default(0),
    });

    const parsedData = attendanceBodySchema.parse(request.body);
    const { sub: user_id, store_id } = request.user as { sub: string; store_id: number };

    if (!store_id) {
        return reply.status(403).send({ message: 'Operação abortada: Colaborador sem loja vinculada.' });
    }

    // Calcular o valor do contrato que foi recebido (Supondo que venha no payload. Adicionando ao Schema!)
    const contract_value = parsedData.contract_value || 0;

    // Motor de Comissões: Avaliar Faixas (Tiers)
    const commission_value = await commissionEngine.calculateCommission(
        user_id,
        parsedData.product_id,
        contract_value,
        parsedData.attendance_date
    );

    const attendance = await prisma.attendance.create({
        data: {
            ...parsedData, // Injecta parsedData, incluindo contract_value
            commission_value, // Injetado pela Engine Zero-Trust (não permite manipular no frontend)
            user_id, // Atribuição Indissociável (Zero-Trust) baseada no JWT, não no Body
            store_id, // Vinculação forçada pela loja do colaborador logado
        },
    });

    return reply.status(201).send({ attendance });
}

export async function updateAttendance(request: FastifyRequest, reply: FastifyReply) {
    const attendanceParamsSchema = z.object({
        id: z.string().uuid(),
    });

    const attendanceBodySchema = z.object({
        customer_name: z.string().min(3),
        customer_cpf: z.string().length(11),
        attendance_date: z.string().transform((str) => new Date(str)),
        product_id: z.number().int(),
        operation_type_id: z.number().int(),
        attendance_status_id: z.number().int(),
        sales_channel_id: z.number().int(),
        paid_approved: z.boolean(),
        city: z.string(),
        origin_bank: z.string().optional().nullable(),
        contract_value: z.number().min(0).optional().default(0),
    });

    const { id } = attendanceParamsSchema.parse(request.params);
    const parsedData = attendanceBodySchema.parse(request.body);
    const { sub: user_id, role, store_id } = request.user as { sub: string; role: string; store_id: number };

    // Buscar o atendimento para validar permissões
    const existingAttendance = await prisma.attendance.findUnique({
        where: { id },
    });

    if (!existingAttendance) {
        return reply.status(404).send({ message: 'Atendimento não encontrado.' });
    }

    // RBAC: Zero-Trust. O operador só mexe no dele. O gestor só mexe nos da sua loja. O Admin mexe em qualquer um.
    if (role === 'OPERADOR' && existingAttendance.user_id !== user_id) {
        return reply.status(403).send({ message: 'Você só pode editar os seus próprios atendimentos.' });
    }
    if (role === 'GESTOR' && existingAttendance.store_id !== store_id) {
        return reply.status(403).send({ message: 'Você só pode editar atendimentos de colaboradores da sua loja.' });
    }

    // Calcular nova comissão caso os dados de valor ou produto tenham mudado
    const contract_value = parsedData.contract_value || 0;
    const commission_value = await commissionEngine.calculateCommission(
        existingAttendance.user_id, // Mantém a comissão vinculada ao usuário original que fez a venda
        parsedData.product_id,
        contract_value,
        parsedData.attendance_date
    );

    const updatedAttendance = await prisma.attendance.update({
        where: { id },
        data: {
            ...parsedData,
            commission_value,
        },
    });

    return reply.status(200).send({ attendance: updatedAttendance });
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
                product: { select: { id: true, name: true } },
                operation_type: { select: { id: true, name: true } },
                attendance_status: { select: { id: true, name: true } },
                sales_channel: { select: { id: true, name: true } },
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
