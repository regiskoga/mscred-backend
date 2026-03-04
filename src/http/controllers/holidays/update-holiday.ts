import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';

export async function updateHoliday(request: FastifyRequest, reply: FastifyReply) {
    const updateHolidayParamsSchema = z.object({
        id: z.coerce.number(),
    });

    const updateHolidayBodySchema = z.object({
        name: z.string().min(1, { message: 'Required name' }),
        date: z.string().datetime({ message: 'Invalid date format' }),
    });

    const { id } = updateHolidayParamsSchema.parse(request.params);
    const { name, date } = updateHolidayBodySchema.parse(request.body);

    const existingHoliday = await prisma.holiday.findUnique({
        where: { id },
    });

    if (!existingHoliday) {
        return reply.status(404).send({ message: 'Holiday not found.' });
    }

    const holiday = await prisma.holiday.update({
        where: { id },
        data: {
            name,
            date,
        },
    });

    // Zero-Trust Auditing
    await prisma.auditLog.create({
        data: {
            user_id: (request.user as any).sub,
            action: 'UPDATE',
            table_name: 'holidays',
            record_id: holiday.id.toString(),
            old_payload: existingHoliday,
            new_payload: holiday,
            ip_address: request.ip,
        },
    });

    return reply.status(200).send(holiday);
}
