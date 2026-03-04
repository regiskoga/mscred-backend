import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';

export async function createHoliday(request: FastifyRequest, reply: FastifyReply) {
    const createHolidayBodySchema = z.object({
        name: z.string().min(1, { message: 'Required name' }),
        date: z.string().datetime({ message: 'Invalid date format' }),
    });

    const { name, date } = createHolidayBodySchema.parse(request.body);

    const holiday = await prisma.holiday.create({
        data: {
            name,
            date,
        },
    });

    // Zero-Trust Auditing
    await prisma.auditLog.create({
        data: {
            user_id: (request.user as any).sub,
            action: 'INSERT',
            table_name: 'holidays',
            record_id: holiday.id.toString(),
            new_payload: holiday,
            ip_address: request.ip,
        },
    });

    return reply.status(201).send(holiday);
}
