import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';

export async function deleteHoliday(request: FastifyRequest, reply: FastifyReply) {
    const deleteHolidayParamsSchema = z.object({
        id: z.coerce.number(),
    });

    const { id } = deleteHolidayParamsSchema.parse(request.params);

    const existingHoliday = await prisma.holiday.findUnique({
        where: { id },
    });

    if (!existingHoliday) {
        return reply.status(404).send({ message: 'Holiday not found.' });
    }

    await prisma.holiday.delete({
        where: { id },
    });

    // Zero-Trust Auditing
    await prisma.auditLog.create({
        data: {
            user_id: (request.user as any).sub,
            action: 'DELETE',
            table_name: 'holidays',
            record_id: existingHoliday.id.toString(),
            old_payload: existingHoliday,
            ip_address: request.ip,
        },
    });

    return reply.status(204).send();
}
